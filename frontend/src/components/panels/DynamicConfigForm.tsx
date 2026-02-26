"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { listCatalogs, listSchemas, listTables, aiConfigAssist } from "@/lib/api";
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
  fieldLabel,
  value,
  onChange,
  config,
  className,
  id,
  required,
  invalid,
}: {
  fieldKey: string;
  fieldLabel: string;
  value: string;
  onChange: (v: string) => void;
  config: Record<string, unknown>;
  className?: string;
  id?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const handler = (e: MouseEvent) => {
        if (!node.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    },
    []
  );

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

  const filtered = useMemo(() => {
    if (!filter) return options;
    const lower = filter.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, filter]);

  const placeholder =
    fieldKey === "catalog"
      ? "Select or type catalog..."
      : fieldKey === "schema"
        ? "Select or type schema..."
        : "Select or type table name...";

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        type="text"
        value={value ?? ""}
        onChange={(e) => {
          onChange(e.target.value);
          setFilter(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={loading ? "Loading..." : placeholder}
        disabled={loading}
        aria-label={fieldLabel}
        aria-required={required}
        aria-invalid={invalid}
        autoComplete="off"
        className={cn(
          "w-full rounded-md border bg-[#21262d80] px-3 py-2 text-sm text-[#f0f6fc] placeholder:text-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]",
          "border-[#30363d]",
          className
        )}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[#30363d] bg-[#1c2128] shadow-lg">
          {filtered.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt.value);
                  setFilter("");
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm hover:bg-[#30363d]",
                  opt.value === value
                    ? "bg-[#30363d] text-[#58a6ff]"
                    : "text-[#c9d1d9]"
                )}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
  config,
  availableColumns = [],
  invalid,
  id,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  config: Record<string, unknown>;
  availableColumns?: string[];
  invalid?: boolean;
  id?: string;
}) {
  const baseInputClass =
    "w-full rounded-md border bg-[#21262d80] px-3 py-2 text-sm text-[#f0f6fc] placeholder:text-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]";
  const errorClass = invalid ? "border-red-500" : "border-[#30363d]";

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
        fieldLabel={field.label}
        value={(value as string) ?? ""}
        onChange={(v) => onChange(v)}
        config={config}
        className={errorClass}
        id={id}
        required={field.required}
        invalid={invalid}
      />
    );
  }

  const inputProps = {
    id,
    "aria-label": field.label,
    "aria-required": field.required,
    "aria-invalid": invalid,
  };

  switch (field.type) {
    case "text":
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={handleChange}
          placeholder={field.placeholder}
          className={cn(baseInputClass, errorClass)}
          {...inputProps}
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
          {...inputProps}
        />
      );

    case "select":
      return (
        <select
          value={(value as string) ?? field.defaultValue ?? ""}
          onChange={handleChange}
          className={cn(baseInputClass, errorClass)}
          {...inputProps}
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
          id={id}
          label={field.label}
          required={field.required}
          invalid={invalid}
        />
      );
    }

    case "toggle":
      return (
        <label htmlFor={id} className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            id={id}
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={handleToggle}
            aria-label={field.label}
            aria-required={field.required}
            aria-invalid={invalid}
            className="h-4 w-4 rounded border-[#30363d] bg-[#21262d] text-[#58a6ff] focus:ring-[#58a6ff]"
          />
          <span className="text-sm text-[#c9d1d9]">
            {Boolean(value ?? field.defaultValue ?? false) ? "Yes" : "No"}
          </span>
        </label>
      );

    case "code": {
      const lang = field.codeLanguage ?? "python";
      return (
        <div className="min-h-[120px] overflow-hidden rounded-md border border-[#30363d]" aria-label={field.label}>
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
          {...inputProps}
        />
      );

    case "duration": {
      const d = value as { value?: number; unit?: string } | undefined;
      const numVal = d?.value;
      const unitVal = d?.unit ?? "minutes";
      return (
        <div className="flex gap-2" role="group" aria-label={field.label}>
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
            aria-label={`${field.label} value`}
            aria-required={field.required}
            aria-invalid={invalid}
          />
          <select
            value={unitVal}
            onChange={(e) =>
              handleDurationChange(numVal, e.target.value)
            }
            className={cn(baseInputClass, errorClass, "w-28")}
            aria-label={`${field.label} unit`}
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
          ariaLabel={field.label}
          required={field.required}
          invalid={invalid}
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
          id={id}
          label={field.label}
          required={field.required}
          invalid={invalid}
        />
      );
    }

    case "schema-picker": {
      const schemaLang = field.codeLanguage ?? "json";
      return (
        <div className="min-h-[80px] overflow-hidden rounded-md border border-[#30363d]" aria-label={field.label}>
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
          {...inputProps}
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
  id,
  label,
  required,
  invalid,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  label?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };
  return (
    <div
      className="flex flex-wrap gap-2 rounded-md border border-[#30363d] bg-[#21262d80] p-2"
      role="group"
      aria-label={label}
    >
      {options.length === 0 ? (
        <span className="text-sm text-[#484f58]">{placeholder ?? "No options"}</span>
      ) : (
        options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={selected.includes(opt.value)}
            aria-label={`${opt.label}, ${selected.includes(opt.value) ? "selected" : "not selected"}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selected.includes(opt.value)
                ? "bg-[#1f6feb] text-white"
                : "bg-[#30363d] text-[#c9d1d9] hover:bg-[#30363d]"
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
  ariaLabel,
  required,
  invalid,
}: {
  pairs: { key: string; value: string }[];
  onChange: (p: { key: string; value: string }[]) => void;
  className?: string;
  ariaLabel?: string;
  required?: boolean;
  invalid?: boolean;
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
    <div
      className="space-y-2"
      role="group"
      aria-label={ariaLabel}
    >
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={p.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder="Key"
            aria-label={`${ariaLabel ?? "Key-value"} pair ${i + 1} key`}
            className={cn(
              "flex-1 rounded-md border bg-[#21262d80] px-3 py-2 text-sm text-[#f0f6fc]",
              className
            )}
          />
          <input
            type="text"
            value={p.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder="Value"
            aria-label={`${ariaLabel ?? "Key-value"} pair ${i + 1} value`}
            className={cn(
              "flex-1 rounded-md border bg-[#21262d80] px-3 py-2 text-sm text-[#f0f6fc]",
              className
            )}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-md border border-[#30363d] px-2 text-red-400 hover:bg-red-500/10"
            aria-label={`Remove pair ${i + 1}`}
          >
            −
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-[#484f58] px-3 py-1.5 text-sm text-[#8b949e] hover:border-[#8b949e] hover:text-[#c9d1d9]"
        aria-label="Add key-value pair"
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
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#484f58]">
              {group}
            </h4>
            <div className="space-y-4">
              {groupFields
                .filter((f) => isFieldVisible(f, config))
                .map((f) => {
                  const val = config[f.key] ?? f.defaultValue;
                  const hasError = f.required && isValid === false && errors.some((e) => e.startsWith(f.label));
                  const fieldId = `config-${f.key}-${group}`;
                  return (
                    <div key={f.key}>
                      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[#c9d1d9]">
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
                        id={fieldId}
                      />
                      {f.helpText && (
                        <p className="mt-1 text-xs text-[#484f58]">
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

  const handleAiAssist = async () => {
    if (!aiPrompt.trim() || aiPrompt.trim().length < 5) {
      setAiError("Describe what you want in at least 5 characters.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await aiConfigAssist(definition.type, aiPrompt.trim());
      onChange({ ...config, ...result.config });
      setAiOpen(false);
      setAiPrompt("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "userMessage" in err
          ? String((err as { userMessage?: string }).userMessage)
          : err instanceof Error ? err.message : "Failed to generate config";
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setAiOpen((o) => !o); setAiError(null); }}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            aiOpen
              ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
              : "border-[#30363d] bg-[#21262d80] text-[#c9d1d9] hover:border-[#484f58] hover:bg-[#21262d] hover:text-[#e8eaed]"
          )}
          aria-label="AI Config Assist"
          aria-expanded={aiOpen}
        >
          <Sparkles className="h-4 w-4" />
          AI Config Assist
        </button>
        {hasSchemaFields && (
          <button
            type="button"
            onClick={() => setSchemaBrowserOpen(true)}
            className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d80] px-3 py-2 text-sm font-medium text-[#c9d1d9] hover:border-[#484f58] hover:bg-[#21262d] hover:text-[#e8eaed]"
            aria-label="Browse schema to select catalog, schema, and table"
          >
            <Search className="h-4 w-4" />
            Browse schema
          </button>
        )}
      </div>

      {aiOpen && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={`Describe how to configure this ${definition.label ?? definition.type}...`}
            className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
            rows={2}
            disabled={aiLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAiAssist();
              }
            }}
          />
          {aiError && <p className="text-xs text-red-400">{aiError}</p>}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[#484f58]">
              <kbd className="rounded border border-[#30363d] bg-[#21262d] px-1 py-0.5">⌘</kbd>+<kbd className="rounded border border-[#30363d] bg-[#21262d] px-1 py-0.5">Enter</kbd>
            </p>
            <button
              type="button"
              onClick={handleAiAssist}
              disabled={aiLoading || !aiPrompt.trim()}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                aiLoading
                  ? "bg-purple-600/50 text-purple-200 cursor-wait"
                  : "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {aiLoading ? "Generating..." : "Fill Config"}
            </button>
          </div>
        </div>
      )}

      {renderFieldGroup(allFields.main)}

      {allFields.adv.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-md border border-[#30363d] bg-[#21262d]/30 px-3 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#21262d80]"
            aria-expanded={advancedOpen}
            aria-label="Advanced configuration options"
          >
            Advanced
            <span className="text-[#484f58]">{advancedOpen ? "▼" : "▶"}</span>
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
