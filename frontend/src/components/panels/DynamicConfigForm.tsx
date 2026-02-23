"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { listCatalogs, listSchemas, listTables } from "@/lib/api";
import SchemaBrowser from "@/components/schema/SchemaBrowser";
import type {
  NodeDefinition,
  ConfigField,
  ConfigFieldType,
} from "@/types/nodes";

const DURATION_UNITS = [
  { value: "seconds", label: "Seconds" },
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

export interface DynamicConfigFormProps {
  definition: NodeDefinition;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  /** Optional: upstream schema columns for column-picker (placeholder until wired) */
  availableColumns?: string[];
  className?: string;
}

function isFieldVisible(
  field: ConfigField,
  config: Record<string, unknown>
): boolean {
  const dep = field.dependsOn;
  if (!dep) return true;
  const actualValue = config[dep.field];
  if (dep.values !== undefined) {
    return Array.isArray(dep.values) && dep.values.includes(actualValue);
  }
  return actualValue === dep.value;
}

const SCHEMA_FIELD_KEYS = ["catalog", "schema", "table", "table_name"];

function SchemaSelectInput({
  fieldKey,
  value,
  onChange,
  config,
  className,
}: {
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  config: Record<string, unknown>;
  className?: string;
}) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fieldKey === "catalog") {
      setLoading(true);
      listCatalogs()
        .then((data) =>
          setOptions(data.map((c) => ({ value: c.name, label: c.name })))
        )
        .finally(() => setLoading(false));
      return;
    }
    if (fieldKey === "schema") {
      const catalog = config.catalog as string | undefined;
      if (!catalog) {
        setOptions([]);
        return;
      }
      setLoading(true);
      listSchemas(catalog)
        .then((data) =>
          setOptions(data.map((s) => ({ value: s.name, label: s.name })))
        )
        .finally(() => setLoading(false));
      return;
    }
    if (fieldKey === "table" || fieldKey === "table_name") {
      const catalog = config.catalog as string | undefined;
      const schema = config.schema as string | undefined;
      if (!catalog || !schema) {
        setOptions([]);
        return;
      }
      setLoading(true);
      listTables(catalog, schema)
        .then((data) =>
          setOptions(data.map((t) => ({ value: t.name, label: t.name })))
        )
        .finally(() => setLoading(false));
      return;
    }
    setOptions([]);
  }, [fieldKey, config.catalog, config.schema]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <select
      value={value ?? ""}
      onChange={handleChange}
      disabled={loading}
      className={cn(
        "w-full rounded-md border bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
        "border-slate-600",
        className
      )}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
  config,
  availableColumns = [],
  invalid,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  config: Record<string, unknown>;
  availableColumns?: string[];
  invalid?: boolean;
}) {
  const baseInputClass =
    "w-full rounded-md border bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const errorClass = invalid ? "border-red-500" : "border-slate-600";

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      if (field.type === "number") {
        onChange(v === "" ? undefined : Number(v));
      } else {
        onChange(v);
      }
    },
    [field.type, onChange]
  );

  const handleToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  const handleKeyValueChange = useCallback(
    (pairs: { key: string; value: string }[]) => {
      onChange(pairs);
    },
    [onChange]
  );

  const handleDurationChange = useCallback(
    (val: number | undefined, unit: string) => {
      onChange(val !== undefined ? { value: val, unit } : undefined);
    },
    [onChange]
  );

  const handleMultiselectChange = useCallback(
    (selected: string[]) => {
      onChange(selected);
    },
    [onChange]
  );

  if (
    field.type === "text" &&
    SCHEMA_FIELD_KEYS.includes(field.key)
  ) {
    return (
      <SchemaSelectInput
        fieldKey={field.key}
        value={(value as string) ?? ""}
        onChange={(v) => onChange(v)}
        config={config}
        className={errorClass}
      />
    );
  }

  switch (field.type) {
    case "text":
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={handleChange}
          placeholder={field.placeholder}
          className={cn(baseInputClass, errorClass)}
        />
      );

    case "number":
      return (
        <input
          type="number"
          value={(value as number) ?? ""}
          onChange={handleChange}
          placeholder={field.placeholder}
          min={field.validation?.min}
          max={field.validation?.max}
          className={cn(baseInputClass, errorClass)}
        />
      );

    case "select":
      return (
        <select
          value={(value as string) ?? field.defaultValue ?? ""}
          onChange={handleChange}
          className={cn(baseInputClass, errorClass)}
        >
          <option value="">Select...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <MultiselectInput
          options={field.options ?? []}
          selected={selected}
          onChange={handleMultiselectChange}
          placeholder={field.placeholder}
          className={cn(baseInputClass, errorClass)}
        />
      );
    }

    case "toggle":
      return (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={handleToggle}
            className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-300">
            {Boolean(value ?? field.defaultValue ?? false) ? "Yes" : "No"}
          </span>
        </label>
      );

    case "code": {
      const lang = field.codeLanguage ?? "python";
      return (
        <div className="min-h-[120px] overflow-hidden rounded-md border border-slate-600">
          <Editor
            height="120px"
            defaultLanguage={lang}
            value={(value as string) ?? ""}
            onChange={(v) => onChange(v ?? "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
          />
        </div>
      );
    }

    case "expression":
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={handleChange}
          placeholder={field.placeholder}
          className={cn(baseInputClass, errorClass, "font-mono text-xs")}
        />
      );

    case "duration": {
      const d = value as { value?: number; unit?: string } | undefined;
      const numVal = d?.value;
      const unitVal = d?.unit ?? "minutes";
      return (
        <div className="flex gap-2">
          <input
            type="number"
            value={numVal ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              handleDurationChange(
                v === "" ? undefined : Number(v),
                unitVal
              );
            }}
            min={0}
            className={cn(baseInputClass, errorClass, "flex-1")}
          />
          <select
            value={unitVal}
            onChange={(e) =>
              handleDurationChange(numVal, e.target.value)
            }
            className={cn(baseInputClass, errorClass, "w-28")}
          >
            {DURATION_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case "key-value": {
      const pairs = Array.isArray(value)
        ? (value as { key: string; value: string }[])
        : [];
      return (
        <KeyValueInput
          pairs={pairs}
          onChange={handleKeyValueChange}
          className={errorClass}
        />
      );
    }

    case "column-picker": {
      const colOptions = availableColumns.map((c) => ({ value: c, label: c }));
      const selectedCols = Array.isArray(value) ? (value as string[]) : [];
      return (
        <MultiselectInput
          options={colOptions}
          selected={selectedCols}
          onChange={(v) => onChange(v)}
          placeholder={field.placeholder ?? "Select columns (upstream schema will populate)"}
          className={cn(baseInputClass, errorClass)}
        />
      );
    }

    case "schema-picker": {
      const schemaLang = field.codeLanguage ?? "json";
      return (
        <div className="min-h-[80px] overflow-hidden rounded-md border border-slate-600">
          <Editor
            height="80px"
            defaultLanguage={schemaLang}
            value={
              typeof value === "string"
                ? value
                : value
                  ? JSON.stringify(value, null, 2)
                  : ""
            }
            onChange={(v) => onChange(v ?? "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      );
    }

    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={handleChange}
          placeholder={field.placeholder}
          className={cn(baseInputClass, errorClass)}
        />
      );
  }
}

function MultiselectInput({
  options,
  selected,
  onChange,
  placeholder,
  className,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2 rounded-md border border-slate-600 bg-slate-800/50 p-2">
      {options.length === 0 ? (
        <span className="text-sm text-slate-500">{placeholder ?? "No options"}</span>
      ) : (
        options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selected.includes(opt.value)
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            )}
          >
            {opt.label}
          </button>
        ))
      )}
    </div>
  );
}

function KeyValueInput({
  pairs,
  onChange,
  className,
}: {
  pairs: { key: string; value: string }[];
  onChange: (p: { key: string; value: string }[]) => void;
  className?: string;
}) {
  const update = (idx: number, key: "key" | "value", val: string) => {
    const next = [...pairs];
    if (!next[idx]) next[idx] = { key: "", value: "" };
    next[idx] = { ...next[idx], [key]: val };
    onChange(next);
  };
  const add = () => onChange([...pairs, { key: "", value: "" }]);
  const remove = (idx: number) =>
    onChange(pairs.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={p.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder="Key"
            className={cn(
              "flex-1 rounded-md border bg-slate-800/50 px-3 py-2 text-sm text-slate-100",
              className
            )}
          />
          <input
            type="text"
            value={p.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder="Value"
            className={cn(
              "flex-1 rounded-md border bg-slate-800/50 px-3 py-2 text-sm text-slate-100",
              className
            )}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-md border border-slate-600 px-2 text-red-400 hover:bg-red-500/10"
          >
            −
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-slate-500 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-400 hover:text-slate-300"
      >
        + Add
      </button>
    </div>
  );
}

export function DynamicConfigForm({
  definition,
  config,
  onChange,
  onValidationChange,
  availableColumns = [],
  className,
}: DynamicConfigFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [schemaBrowserOpen, setSchemaBrowserOpen] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const hasSchemaFields = useMemo(
    () =>
      (definition.configFields ?? []).some((f) =>
        SCHEMA_FIELD_KEYS.includes(f.key)
      ) ||
      (definition.advancedFields ?? []).some((f) =>
        SCHEMA_FIELD_KEYS.includes(f.key)
      ),
    [definition.configFields, definition.advancedFields]
  );

  const allFields = useMemo(() => {
    const main = definition.configFields ?? [];
    const adv = definition.advancedFields ?? [];
    return { main, adv };
  }, [definition.configFields, definition.advancedFields]);

  const updateConfig = useCallback(
    (key: string, value: unknown) => {
      const next = { ...config, [key]: value };
      if (key === "catalog") {
        next.schema = undefined;
        next.table = undefined;
        next.table_name = undefined;
      } else if (key === "schema") {
        next.table = undefined;
        next.table_name = undefined;
      } else if (key === "table" || key === "table_name") {
        next.table = value;
        next.table_name = value;
      }
      onChange(next);
      setTouched((t) => new Set(t).add(key));
    },
    [config, onChange]
  );

  const { errors, isValid } = useMemo(() => {
    const errs: string[] = [];
    const check = (fields: ConfigField[]) => {
      for (const f of fields) {
        if (!f.required) continue;
        if (!isFieldVisible(f, config)) continue;
        const v = config[f.key];
        const empty =
          v === undefined ||
          v === null ||
          v === "" ||
          (Array.isArray(v) && v.length === 0);
        if (empty) {
          errs.push(`${f.label} is required`);
        }
      }
    };
    check(allFields.main);
    check(allFields.adv);
    onValidationChange?.(errs.length === 0, errs);
    return { errors: errs, isValid: errs.length === 0 };
  }, [config, allFields.main, allFields.adv, onValidationChange]);

  const renderFieldGroup = (fields: ConfigField[], groupLabel?: string) => {
    const byGroup = fields.reduce<Record<string, ConfigField[]>>((acc, f) => {
      const g = f.group ?? "General";
      if (!acc[g]) acc[g] = [];
      acc[g].push(f);
      return acc;
    }, {});

    return (
      <div className="space-y-6">
        {Object.entries(byGroup).map(([group, groupFields]) => (
          <div key={group}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {group}
            </h4>
            <div className="space-y-4">
              {groupFields
                .filter((f) => isFieldVisible(f, config))
                .map((f) => {
                  const val = config[f.key] ?? f.defaultValue;
                  const hasError = f.required && isValid === false && errors.some((e) => e.startsWith(f.label));
                  return (
                    <div key={f.key}>
                      <label className="mb-1.5 block text-sm font-medium text-slate-300">
                        {f.label}
                        {f.required && (
                          <span className="ml-1 text-red-400">*</span>
                        )}
                      </label>
                      <ConfigFieldInput
                        field={f}
                        value={val}
                        onChange={(v) => updateConfig(f.key, v)}
                        config={config}
                        availableColumns={availableColumns}
                        invalid={hasError}
                      />
                      {f.helpText && (
                        <p className="mt-1 text-xs text-slate-500">
                          {f.helpText}
                        </p>
                      )}
                      {hasError && (
                        <p className="mt-1 text-xs text-red-400">
                          {f.label} is required
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleSchemaSelect = useCallback(
    (sel: { catalog: string; schema: string; table: string }) => {
      onChange({
        ...config,
        catalog: sel.catalog,
        schema: sel.schema,
        table: sel.table,
        table_name: sel.table,
      });
      setSchemaBrowserOpen(false);
    },
    [config, onChange]
  );

  return (
    <div className={cn("space-y-6", className)}>
      {hasSchemaFields && (
        <div>
          <button
            type="button"
            onClick={() => setSchemaBrowserOpen(true)}
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <Search className="h-4 w-4" />
            Browse schema
          </button>
        </div>
      )}
      {renderFieldGroup(allFields.main)}

      {allFields.adv.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-md border border-slate-600 bg-slate-800/30 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/50"
          >
            Advanced
            <span className="text-slate-500">{advancedOpen ? "▼" : "▶"}</span>
          </button>
          {advancedOpen && (
            <div className="mt-4 pl-0">
              {renderFieldGroup(allFields.adv)}
            </div>
          )}
        </div>
      )}

      {schemaBrowserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[80vh] max-h-[700px] w-full max-w-4xl">
            <SchemaBrowser
              onClose={() => setSchemaBrowserOpen(false)}
              onSelect={handleSchemaSelect}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DynamicConfigForm;
