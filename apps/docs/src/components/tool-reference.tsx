import type { JSONSchema7 } from "json-schema";

type Schema = JSONSchema7;

export interface ToolReferenceProps {
  readonly pack: string;
  readonly name: string;
  readonly description: string;
  readonly streaming: boolean;
  readonly input: Schema;
  readonly output: Schema;
}

interface FieldRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly constraints: string;
  readonly description: string;
}

function describeType(s: Schema): string {
  if (typeof s !== "object" || s === null) return "?";
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(s.type)) return s.type.join(" | ");
  if (typeof s.type === "string") {
    if (s.type === "array") {
      const items = s.items as Schema | undefined;
      return items ? `${describeType(items)}[]` : "any[]";
    }
    return s.type;
  }
  return "object";
}

function describeConstraints(s: Schema): string {
  if (typeof s !== "object" || s === null) return "";
  const parts: string[] = [];
  if (s.minimum !== undefined) parts.push(`>= ${s.minimum}`);
  if (s.maximum !== undefined) parts.push(`<= ${s.maximum}`);
  if (s.exclusiveMinimum !== undefined) parts.push(`> ${s.exclusiveMinimum}`);
  if (s.exclusiveMaximum !== undefined) parts.push(`< ${s.exclusiveMaximum}`);
  if (s.minLength !== undefined) parts.push(`length >= ${s.minLength}`);
  if (s.maxLength !== undefined) parts.push(`length <= ${s.maxLength}`);
  if (s.pattern) parts.push(`/${s.pattern}/`);
  if (s.default !== undefined) parts.push(`default: ${JSON.stringify(s.default)}`);
  return parts.join(", ");
}

function flatten(schema: Schema): FieldRow[] {
  if (typeof schema !== "object" || schema === null) return [];
  if (schema.type !== "object" || !schema.properties) {
    return [
      {
        name: "(value)",
        type: describeType(schema),
        required: true,
        constraints: describeConstraints(schema),
        description: typeof schema.description === "string" ? schema.description : "",
      },
    ];
  }
  const required = new Set(schema.required ?? []);
  const rows: FieldRow[] = [];
  for (const [k, v] of Object.entries(schema.properties)) {
    const sv = v as Schema;
    rows.push({
      name: k,
      type: describeType(sv),
      required: required.has(k),
      constraints: describeConstraints(sv),
      description: (sv as { description?: string }).description ?? "",
    });
  }
  return rows;
}

function FieldTable({ rows }: { rows: readonly FieldRow[] }) {
  if (rows.length === 0) return <p>(no fields)</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Required</th>
          <th>Constraints</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <code>{row.name}</code>
            </td>
            <td>
              <code>{row.type}</code>
            </td>
            <td>{row.required ? "required" : "optional"}</td>
            <td>{row.constraints || "—"}</td>
            <td>{row.description || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ToolReference(props: ToolReferenceProps) {
  return (
    <div className="tool-reference">
      <header>
        <h2>{props.name}</h2>
        <p>
          <code>{props.pack}</code>
          {props.streaming && <span> · streaming</span>}
        </p>
      </header>
      <p>{props.description}</p>

      <h3>Input</h3>
      <FieldTable rows={flatten(props.input)} />

      <h3>Output</h3>
      <FieldTable rows={flatten(props.output)} />
    </div>
  );
}
