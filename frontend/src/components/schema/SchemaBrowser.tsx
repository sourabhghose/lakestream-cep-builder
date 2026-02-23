"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  ChevronRight,
  Database,
  FolderOpen,
  Table,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listCatalogs,
  listSchemas,
  listTables,
  listColumns,
  type CatalogInfo,
  type SchemaInfo,
  type TableInfo,
  type ColumnInfo,
} from "@/lib/api";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import type { Node } from "@xyflow/react";

export interface SchemaBrowserProps {
  onClose: () => void;
  /** When provided, use table selection to populate this node's config instead of adding new node */
  onSelect?: (config: { catalog: string; schema: string; table: string }) => void;
}

export default function SchemaBrowser({
  onClose,
  onSelect,
}: SchemaBrowserProps) {
  const addNode = usePipelineStore((s) => s.addNode);
  const nodes = usePipelineStore((s) => s.nodes);
  const triggerCodeGen = usePipelineStore((s) => s.triggerCodeGen);

  const [catalogs, setCatalogs] = useState<CatalogInfo[]>([]);
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);

  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const [expandedCatalogs, setExpandedCatalogs] = useState<Set<string>>(new Set());
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalogs(true);
    listCatalogs()
      .then((data) => {
        if (!cancelled) setCatalogs(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCatalog) {
      setSchemas([]);
      setSelectedSchema(null);
      setSelectedTable(null);
      setTables([]);
      setColumns([]);
      return;
    }
    let cancelled = false;
    setLoadingSchemas(true);
    listSchemas(selectedCatalog)
      .then((data) => {
        if (!cancelled) setSchemas(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingSchemas(false);
      });
    setSelectedSchema(null);
    setSelectedTable(null);
    setTables([]);
    setColumns([]);
    return () => {
      cancelled = true;
    };
  }, [selectedCatalog]);

  useEffect(() => {
    if (!selectedCatalog || !selectedSchema) {
      setTables([]);
      setSelectedTable(null);
      setColumns([]);
      return;
    }
    let cancelled = false;
    setLoadingTables(true);
    listTables(selectedCatalog, selectedSchema)
      .then((data) => {
        if (!cancelled) setTables(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingTables(false);
      });
    setSelectedTable(null);
    setColumns([]);
    return () => {
      cancelled = true;
    };
  }, [selectedCatalog, selectedSchema]);

  useEffect(() => {
    if (!selectedCatalog || !selectedSchema || !selectedTable) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    setLoadingColumns(true);
    listColumns(selectedCatalog, selectedSchema, selectedTable)
      .then((data) => {
        if (!cancelled) setColumns(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingColumns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCatalog, selectedSchema, selectedTable]);

  const toggleCatalog = useCallback((name: string) => {
    setExpandedCatalogs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleSchema = useCallback((key: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleUseAsSource = useCallback(() => {
    if (!selectedCatalog || !selectedSchema || !selectedTable) return;

    const config = {
      catalog: selectedCatalog,
      schema: selectedSchema,
      table: selectedTable,
      table_name: selectedTable,
    };

    if (onSelect) {
      onSelect({ catalog: selectedCatalog, schema: selectedSchema, table: selectedTable });
      onClose();
      return;
    }

    const def = NODE_REGISTRY["delta-table-source"];
    if (!def) return;

    const newNode: Node = {
      id: `delta-table-source-${Date.now()}`,
      type: "custom",
      position: { x: 150 + nodes.length * 100, y: 200 },
      data: {
        type: "delta-table-source",
        label: def.label,
        config,
        codeTarget: def.codeTarget,
        configSummary: `${selectedCatalog}.${selectedSchema}.${selectedTable}`,
      },
    };
    addNode(newNode);
    triggerCodeGen();
    onClose();
  }, [
    selectedCatalog,
    selectedSchema,
    selectedTable,
    onSelect,
    onClose,
    addNode,
    nodes.length,
    triggerCodeGen,
  ]);

  const handleUseAsSink = useCallback(() => {
    if (!selectedCatalog || !selectedSchema || !selectedTable) return;

    const config = {
      catalog: selectedCatalog,
      schema: selectedSchema,
      table: selectedTable,
      table_name: selectedTable,
    };

    if (onSelect) {
      onSelect({ catalog: selectedCatalog, schema: selectedSchema, table: selectedTable });
      onClose();
      return;
    }

    const def = NODE_REGISTRY["unity-catalog-table-sink"];
    if (!def) return;

    const newNode: Node = {
      id: `unity-catalog-table-sink-${Date.now()}`,
      type: "custom",
      position: { x: 150 + nodes.length * 100, y: 200 },
      data: {
        type: "unity-catalog-table-sink",
        label: def.label,
        config,
        codeTarget: def.codeTarget,
        configSummary: `${selectedCatalog}.${selectedSchema}.${selectedTable}`,
      },
    };
    addNode(newNode);
    triggerCodeGen();
    onClose();
  }, [
    selectedCatalog,
    selectedSchema,
    selectedTable,
    onSelect,
    onClose,
    addNode,
    nodes.length,
    triggerCodeGen,
  ]);

  const hasSelection =
    selectedCatalog && selectedSchema && selectedTable;

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <h2 className="font-semibold text-slate-200">Unity Catalog Schema Browser</h2>
        <button
          onClick={onClose}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Tree view */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-700 p-2">
          <div className="space-y-0.5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 px-2 py-1">
              Catalogs
            </div>
            {loadingCatalogs ? (
              <div className="flex items-center gap-2 px-2 py-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : catalogs.length === 0 ? (
              <div className="px-2 py-2 text-sm text-slate-500">
                No catalogs (connect Databricks to browse)
              </div>
            ) : (
              catalogs.map((c) => {
                const isExpanded = expandedCatalogs.has(c.name);
                const isSelected = selectedCatalog === c.name;
                return (
                  <div key={c.name}>
                    <button
                      onClick={() => {
                        toggleCatalog(c.name);
                        setSelectedCatalog(c.name);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        isSelected
                          ? "bg-slate-700 text-slate-100"
                          : "text-slate-300 hover:bg-slate-800"
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          isExpanded && "rotate-90"
                        )}
                      />
                      <Database className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="truncate">{c.name}</span>
                    </button>
                    {isExpanded && selectedCatalog === c.name && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700 pl-2">
                        {loadingSchemas ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </div>
                        ) : (
                          schemas.map((s) => {
                            const schemaKey = `${c.name}.${s.name}`;
                            const schemaExpanded = expandedSchemas.has(schemaKey);
                            const schemaSelected =
                              selectedSchema === s.name;
                            return (
                              <div key={schemaKey}>
                                <button
                                  onClick={() => {
                                    toggleSchema(schemaKey);
                                    setSelectedSchema(s.name);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
                                    schemaSelected
                                      ? "bg-slate-700 text-slate-100"
                                      : "text-slate-300 hover:bg-slate-800"
                                  )}
                                >
                                  <ChevronRight
                                    className={cn(
                                      "h-3 w-3 transition-transform",
                                      schemaExpanded && "rotate-90"
                                    )}
                                  />
                                  <FolderOpen className="h-3 w-3 shrink-0 text-slate-500" />
                                  <span className="truncate">{s.name}</span>
                                </button>
                                {schemaExpanded &&
                                  selectedSchema === s.name && (
                                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700 pl-2">
                                      {loadingTables ? (
                                        <div className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          Loading...
                                        </div>
                                      ) : (
                                        tables.map((t) => {
                                          const tableSelected =
                                            selectedTable === t.name;
                                          return (
                                            <button
                                              key={t.name}
                                              onClick={() =>
                                                setSelectedTable(t.name)
                                              }
                                              className={cn(
                                                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
                                                tableSelected
                                                  ? "bg-blue-600/30 text-slate-100"
                                                  : "text-slate-300 hover:bg-slate-800"
                                              )}
                                            >
                                              <Table className="h-3 w-3 shrink-0 text-slate-500" />
                                              <span className="truncate">
                                                {t.name}
                                              </span>
                                              {t.table_type && (
                                                <span className="ml-auto text-xs text-slate-500">
                                                  {t.table_type}
                                                </span>
                                              )}
                                            </button>
                                          );
                                        })
                                      )}
                                    </div>
                                  )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {hasSelection ? (
            <>
              <div className="border-b border-slate-700 px-4 py-3">
                <div className="font-mono text-sm text-slate-200">
                  {selectedCatalog}.{selectedSchema}.{selectedTable}
                </div>
                <div className="mt-2 flex gap-2">
                  {!onSelect && (
                    <>
                      <button
                        onClick={handleUseAsSource}
                        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        <Database className="h-4 w-4" />
                        Use as Source
                      </button>
                      <button
                        onClick={handleUseAsSink}
                        className="flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                      >
                        <Database className="h-4 w-4" />
                        Use as Sink
                      </button>
                    </>
                  )}
                  {onSelect && (
                    <button
                      onClick={handleUseAsSource}
                      className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Apply to Node
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Columns
                </h3>
                {loadingColumns ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading columns...
                  </div>
                ) : columns.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No columns or unable to load
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-left text-slate-500">
                        <th className="pb-2 pr-4 font-medium">Name</th>
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        <th className="pb-2 font-medium">Nullable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col) => (
                        <tr
                          key={col.name}
                          className="border-b border-slate-800 text-slate-300"
                        >
                          <td className="py-1.5 pr-4 font-mono">{col.name}</td>
                          <td className="py-1.5 pr-4 font-mono text-slate-400">
                            {col.type}
                          </td>
                          <td className="py-1.5">
                            {col.nullable ? "Yes" : "No"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
              <div>
                <Table className="mx-auto mb-3 h-12 w-12 text-slate-600" />
                <p className="text-sm">
                  Select a catalog, schema, and table to view columns
                </p>
                <p className="mt-1 text-xs">
                  Use &quot;Use as Source&quot; or &quot;Use as Sink&quot; to add
                  a pre-configured node
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
