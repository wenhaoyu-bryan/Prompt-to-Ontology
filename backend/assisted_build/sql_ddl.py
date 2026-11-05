"""Extract ontology draft metadata from bounded PostgreSQL and MySQL DDL."""

from sqlglot import exp
from sqlglot.dialects.mysql import MySQL
from sqlglot.dialects.postgres import Postgres
from sqlglot.errors import ParseError, TokenError
from sqlglot.parsers.mysql import MySQLParser
from sqlglot.parsers.postgres import PostgresParser


_MAX_BYTES = 256 * 1024
_MAX_TABLES = 32
_MAX_COLUMNS = 100
_MAX_STATEMENTS = 256
_POSTGRES = Postgres()
_MYSQL = MySQL()
DDL_DIALECT_LABELS = {"postgres": "PostgreSQL", "mysql": "MySQL"}
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
_MYSQL_TYPES = {
    **{
        dtype: prop_type for dtype, prop_type in _ONTOLOGY_TYPES.items()
        if dtype not in {
            exp.DType.SMALLSERIAL, exp.DType.BIGSERIAL, exp.DType.MONEY,
            exp.DType.BPCHAR, exp.DType.UUID,
        }
    },
    exp.DType.TINYINT: "integer",
    exp.DType.MEDIUMINT: "integer",
    exp.DType.UTINYINT: "integer",
    exp.DType.USMALLINT: "integer",
    exp.DType.UMEDIUMINT: "integer",
    exp.DType.UINT: "integer",
    exp.DType.UBIGINT: "integer",
    exp.DType.YEAR: "integer",
    exp.DType.UDECIMAL: "number",
    exp.DType.UDOUBLE: "number",
    exp.DType.TINYTEXT: "string",
    exp.DType.MEDIUMTEXT: "string",
    exp.DType.LONGTEXT: "string",
    exp.DType.ENUM: "string",
    exp.DType.SET: "string",
    exp.DType.JSON: "string",
    exp.DType.TIME: "string",
    exp.DType.DATETIME: "datetime",
}
_MYSQL_TABLE_OPTIONS = (
    exp.AutoIncrementProperty, exp.CharacterSetProperty, exp.CollateProperty,
    exp.RowFormatProperty,
)
_MYSQL_COLUMN_OPTIONS = (
    exp.CharacterSetColumnConstraint, exp.CollateColumnConstraint,
    exp.OnUpdateColumnConstraint,
)
_MYSQL_FK_ENGINES = {"innodb": "innodb", "ndb": "ndb", "ndbcluster": "ndb"}
_MYSQL_FK_OPTIONS = {
    f"ON {event} {action}"
    for event in ("DELETE", "UPDATE")
    for action in ("CASCADE", "NO ACTION", "RESTRICT", "SET NULL")
}


class _RejectUnsupported:
    def _warn_unsupported(self):
        # The SQLGlot fallback logs part of the uploaded SQL before returning a Command.
        raise ValueError("Unsupported statement in DDL")


class _PostgresDdlParser(_RejectUnsupported, PostgresParser):
    pass


class _MySqlDdlParser(_RejectUnsupported, MySQLParser):
    pass


def _identifier(node, dialect):
    if not isinstance(node, exp.Identifier):
        raise ValueError("Expected a plain DDL identifier")
    mysql = dialect == "mysql"
    name = node.name if mysql else _POSTGRES.normalize_identifier(node).name
    too_long = len(name) > 64 if mysql else len(name.encode("utf-8")) > 63
    if not name.strip() or "." in name or too_long:
        raise ValueError("DDL identifiers must be nonempty, within the dialect length limit, and contain no dots")
    return name


def _table_name(node, dialect):
    if (
        not isinstance(node, exp.Table)
        or not isinstance(node.this, exp.Identifier)
        or any(value for key, value in node.args.items() if key not in {"this", "db"})
    ):
        raise ValueError("Expected a table name with at most one schema qualifier")
    return ".".join(_identifier(part, dialect) for part in node.parts)


def _column_names(nodes, dialect):
    columns = []
    for node in nodes:
        if dialect == "mysql":
            if isinstance(node, exp.Ordered):
                node = node.this
            if isinstance(node, exp.Column) and not any(
                value for key, value in node.args.items() if key != "this"
            ):
                node = node.this
        columns.append(_identifier(node, dialect))
    distinct = {column.lower() for column in columns} if dialect == "mysql" else set(columns)
    if not columns or len(distinct) != len(columns):
        raise ValueError("Key declarations require distinct column names")
    return columns


def _foreign_key(columns, reference, dialect):
    if not isinstance(reference, exp.Reference):
        raise ValueError("Foreign keys require a REFERENCES clause")
    options = reference.args.get("options") or []
    if (
        dialect == "mysql" and not _MYSQL_FK_OPTIONS.issuperset(options)
        or {"NOT ENFORCED", "MATCH PARTIAL"}.intersection(options)
    ):
        raise ValueError("Unsupported foreign key option")
    target = reference.this
    target_columns = []
    if isinstance(target, exp.Schema):
        target_columns = _column_names(target.expressions, dialect)
        target = target.this
        if len(target_columns) != len(columns):
            raise ValueError("Foreign key column counts must match")
    if dialect == "mysql" and not target_columns:
        raise ValueError("MySQL foreign keys require explicit target columns")
    return {
        "columns": columns,
        "target_table": _table_name(target, dialect),
        "target_columns": target_columns,
    }


def _column(node, dialect):
    mysql = dialect == "mysql"
    name = _identifier(node.this, dialect)
    data_type = node.kind
    if not isinstance(data_type, exp.DataType):
        raise ValueError("Every DDL column must have a supported type")
    serial = data_type.this == exp.DType.SERIAL if mysql else data_type.this in _SERIAL_TYPES
    type_name = (_MYSQL_TYPES if mysql else _ONTOLOGY_TYPES).get(data_type.this)
    alias = data_type.args.get("kind")
    if not mysql and data_type.this == exp.DType.USERDEFINED and isinstance(alias, exp.Identifier):
        serial = not alias.quoted and alias.name.lower() in _SERIAL_ALIASES
        if serial:
            type_name = "integer"
    if type_name is None:
        raise ValueError(f"Unsupported {DDL_DIALECT_LABELS[dialect]} column type")

    nullability = set()
    generated = serial
    keys = [exp.UniqueColumnConstraint()] if mysql and serial else []
    comment = None
    for constraint in node.constraints:
        kind = constraint.kind
        if isinstance(kind, exp.NotNullColumnConstraint):
            nullability.add(not kind.args.get("allow_null"))
        elif isinstance(kind, exp.GeneratedAsIdentityColumnConstraint):
            if mysql:
                raise ValueError("Expected MySQL AUTO_INCREMENT for identity columns")
            generated = True
        elif mysql and isinstance(kind, exp.AutoIncrementColumnConstraint):
            generated = True
        elif mysql and isinstance(kind, exp.CommentColumnConstraint):
            if comment is not None or not isinstance(kind.this, exp.Literal) or not kind.this.is_string:
                raise ValueError("Expected one string literal for the MySQL column comment")
            comment = kind.this.this
        elif mysql and isinstance(kind, exp.Reference):
            raise ValueError("Use a table-level FOREIGN KEY declaration for MySQL")
        elif mysql and isinstance(kind, _MYSQL_COLUMN_OPTIONS):
            continue
        elif not isinstance(kind, (exp.DefaultColumnConstraint, exp.CheckColumnConstraint)):
            keys.append(kind)
    if len(nullability) > 1 or (generated and False in nullability):
        raise ValueError("Conflicting column nullability declarations")
    column = {
        "name": name,
        "type": type_name,
        "sql_type": data_type.sql(dialect=dialect),
        "required": generated or True in nullability,
    }
    if comment is not None:
        column["comment"] = comment
    return column, keys


def _unwrap_constraint(node, dialect):
    if not isinstance(node, exp.Constraint):
        return node
    _identifier(node.this, dialect)
    if len(node.expressions) != 1:
        raise ValueError("Expected one declaration per named constraint")
    return node.expressions[0]


def _apply_keys(table, constraints, dialect):
    columns = {column["name"]: column for column in table["columns"]}
    mysql_columns = {name.lower(): name for name in columns} if dialect == "mysql" else {}
    for inline, constraint in constraints:
        if isinstance(constraint, exp.PrimaryKeyColumnConstraint) and inline:
            key = inline
        elif isinstance(constraint, exp.PrimaryKey) and inline is None:
            key = _column_names(constraint.expressions, dialect)
        else:
            key = None

        if key:
            kind = "primary_key"
        elif isinstance(constraint, exp.Reference) and inline:
            key = inline
            kind = "foreign_keys"
        elif isinstance(constraint, exp.ForeignKey) and inline is None:
            key = _column_names(constraint.expressions, dialect)
            kind = "foreign_keys"
        elif isinstance(constraint, exp.UniqueColumnConstraint):
            group = constraint.this
            if inline and group is None:
                key = inline
            elif inline is None and isinstance(group, exp.Schema) and (
                group.this is None or dialect == "mysql"
            ):
                if group.this is not None:
                    _identifier(group.this, dialect)
                key = _column_names(group.expressions, dialect)
            else:
                raise ValueError("Unsupported UNIQUE constraint")
            kind = "unique_keys"
        else:
            raise ValueError(f"Unsupported {DDL_DIALECT_LABELS[dialect]} table or column constraint")
        if dialect == "mysql":
            key = [mysql_columns.get(column.lower(), column) for column in key]
        if any(column not in columns for column in key):
            raise ValueError("Key declaration references a missing column in its table")

        if kind == "primary_key":
            if table["primary_key"]:
                raise ValueError("A DDL table may declare only one primary key")
            table["primary_key"] = key
        elif kind == "foreign_keys":
            reference = constraint if inline else constraint.args.get("reference")
            table["foreign_keys"].append(_foreign_key(key, reference, dialect))
        else:
            table["unique_keys"].append(key)

    for column in table["primary_key"]:
        columns[column]["required"] = True


def _create_table(statement, dialect):
    mysql = dialect == "mysql"
    allowed = {"this", "kind", "exists"}
    if mysql:
        allowed.add("properties")
    if (
        statement.kind != "TABLE"
        or not isinstance(statement.this, exp.Schema)
        or any(
            value
            for key, value in statement.args.items()
            if key not in allowed
        )
    ):
        raise ValueError(f"Expected a plain {DDL_DIALECT_LABELS[dialect]} CREATE TABLE statement")
    if statement.find(exp.Query, exp.Command):
        raise ValueError("Queries are outside the supported CREATE TABLE subset")

    name = _table_name(statement.this.this, dialect)
    columns = {}
    mysql_columns = set()
    constraints = []
    for node in statement.this.expressions:
        if isinstance(node, exp.ColumnDef):
            column, keys = _column(node, dialect)
            name_key = column["name"].lower()
            if column["name"] in columns or (mysql and name_key in mysql_columns):
                raise ValueError("Duplicate column name in DDL table")
            columns[column["name"]] = column
            if mysql:
                mysql_columns.add(name_key)
            constraints.extend(([column["name"]], key) for key in keys)
        else:
            if mysql and isinstance(node, exp.IndexColumnConstraint):
                continue
            constraint = _unwrap_constraint(node, dialect)
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
    if mysql:
        properties = statement.args.get("properties")
        for option in properties.expressions if properties else ():
            if isinstance(option, exp.SchemaCommentProperty):
                if "comment" in table or not isinstance(option.this, exp.Literal) or not option.this.is_string:
                    raise ValueError("Expected one string literal for the MySQL table comment")
                table["comment"] = option.this.this
            elif isinstance(option, exp.EngineProperty):
                if "engine" in table or not option.name:
                    raise ValueError("Expected one MySQL storage engine")
                table["engine"] = option.name
            elif not isinstance(option, _MYSQL_TABLE_OPTIONS):
                raise ValueError("Unsupported MySQL table option")
    _apply_keys(table, constraints, dialect)
    return table


def _declared_table(tables, name):
    if name not in tables:
        raise ValueError("ALTER and COMMENT must target a previously declared DDL table")
    return tables[name]


def _alter_table(statement, tables, dialect):
    allowed = {"this", "kind", "actions"}
    if dialect == "postgres":
        allowed.add("only")
    if (
        statement.kind != "TABLE"
        or not statement.actions
        or any(
            value
            for key, value in statement.args.items()
            if key not in allowed
        )
    ):
        raise ValueError(_ALTER_TABLE_ERROR)
    table = _declared_table(tables, _table_name(statement.this, dialect))
    constraints = []
    for action in statement.actions:
        if not isinstance(action, exp.AddConstraint) or not action.expressions:
            raise ValueError(_ALTER_TABLE_ERROR)
        constraints.extend(
            (None, _unwrap_constraint(node, dialect)) for node in action.expressions
        )
    _apply_keys(table, constraints, dialect)


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
        _declared_table(tables, _table_name(target, "postgres"))["comment"] = value.this
    elif (
        kind == "COLUMN"
        and isinstance(target, exp.Column)
        and target.table
        and not target.catalog
    ):
        *table_parts, column_name = [_identifier(part, "postgres") for part in target.parts]
        table = _declared_table(tables, ".".join(table_parts))
        for column in table["columns"]:
            if column["name"] == column_name:
                column["comment"] = value.this
                return
        raise ValueError("COMMENT must target a declared DDL column")
    else:
        raise ValueError("Expected COMMENT ON TABLE or COLUMN")


def _resolve_mysql_foreign_keys(tables):
    for name, table in tables.items():
        database, separator, _ = name.rpartition(".")
        for key in table["foreign_keys"]:
            target_name = key["target_table"]
            if separator and "." not in target_name:
                target_name = f"{database}.{target_name}"
            target = tables.get(target_name, {})
            engines = set()
            for endpoint in (table, target):
                engine = endpoint.get("engine")
                if not engine:
                    continue
                normalized = _MYSQL_FK_ENGINES.get(engine.lower())
                if not normalized:
                    raise ValueError("MySQL foreign keys require a supported storage engine")
                engines.add(normalized)
            if len(engines) > 1:
                raise ValueError("MySQL foreign key endpoints must use the same storage engine")
            target_columns = {
                column["name"].lower(): column["name"]
                for column in target.get("columns", [])
            }
            key["target_columns"] = [
                target_columns.get(column.lower(), column)
                for column in key["target_columns"]
            ]


def parse_ddl(sql: str, *, dialect: str = "postgres") -> list[dict]:
    """Extract draft metadata without executing SQL or validating against a database.

    ALTER TABLE may add keys and COMMENT may supply text for earlier declarations.
    Defaults, checks, and key options are omitted. Foreign keys that omit target
    columns retain an empty target_columns list in PostgreSQL. MySQL supports inline
    comments and common SHOW CREATE TABLE options. SQL types use normalized dialect spellings.
    """
    if dialect == "postgres":
        sql_dialect, parser_class = _POSTGRES, _PostgresDdlParser
    elif dialect == "mysql":
        sql_dialect, parser_class = _MYSQL, _MySqlDdlParser
    else:
        raise ValueError("Choose PostgreSQL or MySQL DDL")
    label = DDL_DIALECT_LABELS[dialect]
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
        parser = parser_class(dialect=sql_dialect, max_nodes=12_000)
        tokens = sql_dialect.tokenize(sql)
        if dialect == "mysql" and any(
            comment.startswith(("!", "M!")) for token in tokens for comment in token.comments
        ):
            raise ValueError("MySQL executable comments are outside the supported DDL subset")
        statements = parser.parse(tokens, sql)
    except ParseError as exc:
        if exc.errors:
            error = exc.errors[0]
            raise ValueError(
                f"Invalid {label} DDL at line {error['line']}, column {error['col']}"
            ) from None
        raise ValueError(f"Invalid {label} DDL") from None
    except (TokenError, RecursionError):
        raise ValueError(f"Invalid or overly complex {label} DDL") from None

    statements = [
        statement
        for statement in statements
        if statement is not None and not isinstance(statement, exp.Semicolon)
    ]
    if not statements:
        raise ValueError(f"Expected a plain {label} CREATE TABLE statement")
    if len(statements) > _MAX_STATEMENTS:
        raise ValueError(f"DDL statement limit exceeded ({_MAX_STATEMENTS})")

    tables = {}
    for statement in statements:
        if isinstance(statement, exp.Create):
            if len(tables) == _MAX_TABLES:
                raise ValueError(f"DDL table limit exceeded ({_MAX_TABLES})")
            table = _create_table(statement, dialect)
            if table["name"] in tables:
                raise ValueError("Duplicate table name in DDL")
            tables[table["name"]] = table
        elif isinstance(statement, exp.Alter):
            _alter_table(statement, tables, dialect)
        elif dialect == "postgres" and isinstance(statement, exp.Comment):
            _comment(statement, tables)
        else:
            raise ValueError(f"Unsupported statement in {label} DDL")
    if dialect == "mysql":
        _resolve_mysql_foreign_keys(tables)
    return list(tables.values())
