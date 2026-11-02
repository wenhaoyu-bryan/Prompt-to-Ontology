export default function AppLogo({
  size = 32,
  className = "",
  decorative = false,
}) {
  return (
    <span
      className={`app-logo ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/brand/ontology-reasoning.png"
        width={size}
        height={size}
        alt={decorative ? "" : "Prompt-to-Ontology"}
      />
    </span>
  );
}
