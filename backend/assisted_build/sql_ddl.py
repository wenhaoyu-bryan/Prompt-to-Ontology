"""Extract ontology draft metadata from a bounded subset of PostgreSQL DDL."""

from sqlglot import exp
from sqlglot.dialects.postgres import Postgres
from sqlglot.errors import ParseError, TokenError
from sqlglot.parsers.postgres import PostgresParser


_MAX_BYTES = 256 * 1024
_MAX_TABLES = 32
_MAX_COLUMNS = 100
_MAX_STATEMENTS = 256
_POSTGRES = Postgres()
_DDL_ERROR = (
    "Expected PostgreSQL CREATE TABLE, ALTER TABLE ADD keys, or table/column COMMENT"
)
_CREATE_TABLE_ERROR = "Expected a plain PostgreSQL CREATE TABLE statement"
_ALTER_TABLE_ERROR = "Expected ALTER TABLE ADD PRIMARY KEY, FOREIGN KEY, or UNIQUE"
_SERIAL_TYPES = {exp.DType.SMALLSERIAL, exp.DType.SERIAL, exp.DType.BIGSERIAL}
_SERIAL_ALIASES = {"serial2", "serial4", "serial8"}
_ONTOLOGY_TYPES = {
    exp.DType.SMALLINT: "integer",
    exp.DType.INT: "integer",
    exp.DType.BIGINT: "integer",
    exp.DType.SMALLSERIAL: "integer",
    exp.DType.SERIAL: "integer",
    exp.DType.BIGSERIAL: "integer",
    exp.DType.DECIMAL: "number",
    exp.DType.FLOAT: "number",
    exp.DType.DOUBLE: "number",
    exp.DType.MONEY: "number",
    exp.DType.CHAR: "string",
    exp.DType.BPCHAR: "string",
    exp.DType.VARCHAR: "string",
    exp.DType.TEXT: "string",
    exp.DType.UUID: "string",
    exp.DType.BOOLEAN: "boolean",
    exp.DType.DATE: "date",
    exp.DType.TIMESTAMP: "datetime",
    exp.DType.TIMESTAMPTZ: "datetime",
}


class _DdlParser(PostgresParser):
    def _warn_unsupported(self):
        # The SQLGlot fallback logs part of the uploaded SQL before returning a Command.
        raise ValueError(_DDL_ERROR)


def _identifier(node):
    if not isinstance(node, exp.Identifier):
        raise ValueError("Expected a plain PostgreSQL identifier")
    name = _POSTGRES.normalize_identifier(node).name
    if not name.strip() or "." in name or len(name.encode("utf-8")) > 63:
        raise ValueError(
            "DDL identifiers must be nonempty, at most 63 bytes, and contain no dots"
        )
    return name


def _table_name(node):
    if (
        not isinstance(node, exp.Table)
        or not isinstance(node.this, exp.Identifier)
        or any(value for key, value in node.args.items() if key not in {"this", "db"})
    ):
        raise ValueError("Expected a table name with at most one schema qualifier")
    return ".".join(_identifier(part) for part in node.parts)


def _column_names(nodes):
    columns = [_identifier(node) for node in nodes]
    if not columns or len(set(columns)) != len(columns):
        raise ValueError("Key declarations require distinct column names")
    return columns


def _foreign_key(columns, reference):
    if not isinstance(reference, exp.Reference):
        raise ValueError("Foreign keys require a REFERENCES clause")
    options = reference.args.get("options") or []
    if {"NOT ENFORCED", "MATCH PARTIAL"}.intersection(options):
        raise ValueError("Unsupported foreign key option")
    target = reference.this
    target_columns = []
    if isinstance(target, exp.Schema):
        target_columns = _column_names(target.expressions)
        target = target.this
        if len(target_columns) != len(columns):
            raise ValueError("Foreign key column counts must match")
    return {
        "columns": columns,
        "target_table": _table_name(target),
        "target_columns": target_columns,
    }


def _column(node):
    name = _identifier(node.this)
    data_type = node.kind
    if not isinstance(data_type, exp.DataType):
        raise ValueError("Every DDL column must have a supported PostgreSQL type")
    serial = data_type.this in _SERIAL_TYPES
    type_name = _ONTOLOGY_TYPES.get(data_type.this)
    alias = data_type.args.get("kind")
    if data_type.this == exp.DType.USERDEFINED and isinstance(alias, exp.Identifier):
        serial = not alias.quoted and alias.name.lower() in _SERIAL_ALIASES
        if serial:
            type_name = "integer"
    if type_name is None:
        raise ValueError("Unsupported PostgreSQL column type")

    nullability = set()
    generated = serial
    keys = []
    for constraint in node.constraints:
        kind = constraint.kind
        if isinstance(kind, exp.NotNullColumnConstraint):
            nullability.add(not kind.args.get("allow_null"))
        elif isinstance(kind, exp.GeneratedAsIdentityColumnConstraint):
            generated = True
        elif not isinstance(kind, (exp.DefaultColumnConstraint, exp.CheckColumnConstraint)):
            keys.append(kind)
    if len(nullability) > 1 or (generated and False in nullability):
        raise ValueError("Conflicting column nullability declarations")
    column = {
        "name": name,
        "type": type_name,
        "sql_type": data_type.sql(dialect="postgres"),
        "required": generated or True in nullability,
    }
    return column, keys


def _unwrap_constraint(node):
    if not isinstance(node, exp.Constraint):
        return node
    _identifier(node.this)
    if len(node.expressions) != 1:
        raise ValueError("Expected one declaration per named constraint")
    return node.expressions[0]


def _apply_keys(table, constraints):
    columns = {column["name"]: column for column in table["columns"]}
    for inline, constraint in constraints:
        if isinstance(constraint, exp.PrimaryKeyColumnConstraint) and inline:
            key = inline
        elif isinstance(constraint, exp.PrimaryKey) and inline is None:
            key = _column_names(constraint.expressions)
        else:
            key = None

        if key:
            if table["primary_key"]:
                raise ValueError("A DDL table may declare only one primary key")
            table["primary_key"] = key
        elif isinstance(constraint, exp.Reference) and inline:
            key = inline
            table["foreign_keys"].append(_foreign_key(key, constraint))
        elif isinstance(constraint, exp.ForeignKey) and inline is None:
            key = _column_names(constraint.expressions)
            table["foreign_keys"].append(
                _foreign_key(key, constraint.args.get("reference"))
            )
        elif isinstance(constraint, exp.UniqueColumnConstraint):
            group = constraint.this
            if inline and group is None:
                key = inline
            elif inline is None and isinstance(group, exp.Schema) and group.this is None:
                key = _column_names(group.expressions)
            else:
                raise ValueError("Unsupported UNIQUE constraint")
            table["unique_keys"].append(key)
        else:
            raise ValueError("Unsupported PostgreSQL table or column constraint")
        if any(column not in columns for column in key):
            raise ValueError("Key declaration references a missing column in its table")

    for column in table["primary_key"]:
        columns[column]["required"] = True


def _create_table(statement):
    if (
        statement.kind != "TABLE"
        or not isinstance(statement.this, exp.Schema)
        or any(
            value
            for key, value in statement.args.items()
            if key not in {"this", "kind", "exists"}
        )
    ):
        raise ValueError(_CREATE_TABLE_ERROR)
    if statement.find(exp.Query, exp.Command):
        raise ValueError("Queries are outside the supported CREATE TABLE subset")

    name = _table_name(statement.this.this)
    columns = {}
    constraints = []
    for node in statement.this.expressions:
        if isinstance(node, exp.ColumnDef):
            column, keys = _column(node)
            if column["name"] in columns:
                raise ValueError("Duplicate column name in DDL table")
            columns[column["name"]] = column
            constraints.extend(([column["name"]], key) for key in keys)
        else:
            constraint = _unwrap_constraint(node)
            if not isinstance(constraint, exp.CheckColumnConstraint):
                constraints.append((None, constraint))
    if not columns or len(columns) > _MAX_COLUMNS:
        raise ValueError(
            f"DDL column limit requires 1 to {_MAX_COLUMNS} columns per table"
        )

    table = {
        "name": name,
        "columns": list(columns.values()),
        "primary_key": [],
        "foreign_keys": [],
        "unique_keys": [],
    }
    _apply_keys(table, constraints)
    return table


def _declared_table(tables, name):
    if name not in tables:
        raise ValueError("ALTER and COMMENT must target a previously declared DDL table")
    return tables[name]


def _alter_table(statement, tables):
    if (
        statement.kind != "TABLE"
        or not statement.actions
        or any(
            value
            for key, value in statement.args.items()
            if key not in {"this", "kind", "actions", "only"}
        )
    ):
        raise ValueError(_ALTER_TABLE_ERROR)
    table = _declared_table(tables, _table_name(statement.this))
    constraints = []
    for action in statement.actions:
        if not isinstance(action, exp.AddConstraint) or not action.expressions:
            raise ValueError(_ALTER_TABLE_ERROR)
        constraints.extend(
            (None, _unwrap_constraint(node)) for node in action.expressions
        )
    _apply_keys(table, constraints)


def _comment(statement, tables):
    value = statement.expression
    is_text = isinstance(value, exp.RawString) or (
        isinstance(value, exp.Literal) and value.is_string
    )
    if statement.args.get("exists") or statement.args.get("materialized") or not is_text:
        raise ValueError("Expected COMMENT ON TABLE or COLUMN with a string literal")

    target = statement.this
    kind = statement.args.get("kind", "").upper()
    if kind == "TABLE":
        _declared_table(tables, _table_name(target))["comment"] = value.this
    elif (
        kind == "COLUMN"
        and isinstance(target, exp.Column)
        and target.table
        and not target.catalog
    ):
        *table_parts, column_name = map(_identifier, target.parts)
        table = _declared_table(tables, ".".join(table_parts))
        for column in table["columns"]:
            if column["name"] == column_name:
                column["comment"] = value.this
                return
        raise ValueError("COMMENT must target a declared DDL column")
    else:
        raise ValueError("Expected COMMENT ON TABLE or COLUMN")


def parse_ddl(sql: str) -> list[dict]:
    """Extract draft metadata without executing SQL or validating against a database.

    ALTER TABLE may add keys and COMMENT may supply text for earlier declarations.
    Defaults, checks, and key options are omitted. Foreign keys that omit target
    columns retain an empty target_columns list. SQL types use SQLGlot's normalized
    PostgreSQL spellings.
    """
    if not isinstance(sql, str) or len(sql) > _MAX_BYTES:
        raise ValueError("DDL size limit exceeded")
    try:
        if len(sql.encode("utf-8")) > _MAX_BYTES:
            raise ValueError("DDL size limit exceeded")
    except UnicodeEncodeError:
        raise ValueError("DDL must contain valid UTF-8 text") from None
    if "\x00" in sql:
        raise ValueError("DDL text cannot contain a NUL character")

    sql = sql.removeprefix("\ufeff")
    try:
        parser = _DdlParser(dialect=_POSTGRES, max_nodes=12_000)
        statements = parser.parse(_POSTGRES.tokenize(sql), sql)
    except ParseError as exc:
        if exc.errors:
            error = exc.errors[0]
            raise ValueError(
                f"Invalid PostgreSQL DDL at line {error['line']}, column {error['col']}"
            ) from None
        raise ValueError("Invalid PostgreSQL DDL") from None
    except (TokenError, RecursionError):
        raise ValueError("Invalid or overly complex PostgreSQL DDL") from None

    statements = [
        statement
        for statement in statements
        if statement is not None and not isinstance(statement, exp.Semicolon)
    ]
    if not statements:
        raise ValueError(_CREATE_TABLE_ERROR)
    if len(statements) > _MAX_STATEMENTS:
        raise ValueError(f"DDL statement limit exceeded ({_MAX_STATEMENTS})")

    tables = {}
    for statement in statements:
        if isinstance(statement, exp.Create):
            if len(tables) == _MAX_TABLES:
                raise ValueError(f"DDL table limit exceeded ({_MAX_TABLES})")
            table = _create_table(statement)
            if table["name"] in tables:
                raise ValueError("Duplicate table name in DDL")
            tables[table["name"]] = table
        elif isinstance(statement, exp.Alter):
            _alter_table(statement, tables)
        elif isinstance(statement, exp.Comment):
            _comment(statement, tables)
        else:
            raise ValueError(_DDL_ERROR)
    return list(tables.values())
