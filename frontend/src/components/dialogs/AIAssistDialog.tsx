"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Sparkles, X, Loader2, Lightbulb, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { aiGeneratePipeline } from "@/lib/api";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import type { Node, Edge } from "@xyflow/react";

interface AIAssistDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExamplePrompt {
  label: string;
  category: string;
  prompt: string;
}

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  // ── Financial Services ──
  { label: "Fraud Detection", category: "Financial Services", prompt: "Fraud detection: read credit card transactions from Kafka, detect >3 transactions from the same card within 5 minutes using count threshold, detect login→transfer→logout sequence within 2 minutes, alert via email and Slack, write fraud alerts to Delta" },
  { label: "Anti-Money Laundering", category: "Financial Services", prompt: "AML monitoring: Kafka bank transactions, data quality checks on KYC fields, detect structuring pattern (>5 transactions under $10K in 24 hours), cross-account temporal correlation for rapid fund movement, ML risk scoring model, route high-risk alerts to SAR table and email compliance team" },
  { label: "Payment Anomaly", category: "Financial Services", prompt: "Payment anomaly detection: Kafka payment events, z-score outlier detection on transaction amounts with 1-hour baseline, velocity detector for >20 payments per minute per merchant, write anomalies to Delta and alert via PagerDuty" },

  // ── Healthcare ──
  { label: "Patient Vitals (ICU)", category: "Healthcare", prompt: "ICU patient monitoring: MQTT sensor data from bedside monitors, heartbeat/liveness detection for silent devices (alert if no reading in 30 seconds), state machine tracking patient status (stable → warning → critical → code blue), trend detection on rising heart rate, ML severity prediction, route critical alerts to PagerDuty, write all events to Delta" },
  { label: "Clinical Trial Events", category: "Healthcare", prompt: "Clinical trial monitoring: Kafka trial events, sequence detector for patient journey (consent → screening → randomization → treatment → follow-up), absence detector for missed visits within 14 days, data quality checks on dosage values, write to Unity Catalog and email trial coordinators" },

  // ── Telecom ──
  { label: "Cell Tower Monitoring", category: "Telecom", prompt: "Cell tower monitoring: Kafka tower metrics with 15-second watermark for late data, outlier detection on latency using z-score, velocity detection for handoff failure spikes (>10 failures per 5 minutes), heartbeat/liveness for tower health (expected ping every 2 minutes), route critical vs warning alerts via split/router, write to Delta and PagerDuty" },
  { label: "Network Congestion", category: "Telecom", prompt: "Network congestion detection: Kafka network metrics, tumbling window aggregate bandwidth per cell sector every 5 minutes, trend detector for sustained bandwidth increase, count threshold for >100 dropped calls in 10 minutes, send alerts to Slack" },

  // ── Gaming ──
  { label: "Player Behavior Analytics", category: "Gaming", prompt: "Player analytics: Kafka game events, deduplicate by event_id, session detection with 15-minute gap, sequence detector for achievement progression (tutorial complete → first kill → first win), count threshold for cheat detection (>50 kills in 1 minute), aggregate session metrics per player, write player features to Feature Store for matchmaking ML model, alert anti-cheat team via Slack" },
  { label: "In-Game Economy", category: "Gaming", prompt: "In-game economy monitoring: Kafka marketplace events, velocity detector for rapid trades (>20 trades per minute per player), outlier detection on gold amounts using z-score, temporal correlation between item duplication and trades, write suspicious activity to Delta and alert via webhook" },

  // ── Insurance ──
  { label: "Claims Triage", category: "Insurance", prompt: "Insurance claims triage: CDC stream from claims database, data quality validation (amount > 0, policy_id not null, valid claim type), state machine for claim lifecycle (filed → under_review → approved/denied/escalated), split/route by claim severity (high-value > $50K), absence detector for claims not reviewed within 48 hours, email escalation alerts, write to Delta" },
  { label: "Underwriting Risk", category: "Insurance", prompt: "Underwriting risk scoring: Kafka application events, data quality on applicant fields, enrich with lookup table for loss history, ML risk prediction model, split/route low-risk for auto-approval vs high-risk for manual review, write decisions to Unity Catalog" },

  // ── Media / Advertising ──
  { label: "Ad Attribution", category: "Media / Advertising", prompt: "Multi-touch ad attribution: Google Pub/Sub for impressions and clicks, deduplicate impression events, temporal correlation between impressions and clicks within 30 minutes, sequence detector for full conversion path (impression → click → conversion within 7 days), hourly tumbling window CTR aggregation per campaign, write attribution events and campaign metrics to Unity Catalog" },
  { label: "Content Engagement", category: "Media / Advertising", prompt: "Content engagement tracking: Kafka user activity events, session detection with 30-minute gap, sequence detector for binge pattern (play → pause → play → complete repeated 3+ times), window aggregate watch time per show per hour, trend detector for viral content, write to Delta Lake" },

  // ── Real Estate / PropTech ──
  { label: "Smart Building", category: "Real Estate / PropTech", prompt: "Smart building management: MQTT building sensors with 10-second watermark, HVAC state machine (idle → heating → cooling → ventilating → emergency_shutdown), heartbeat/liveness for sensor health (expected every 5 minutes), 5-minute tumbling window zone aggregates for temperature, humidity, and occupancy, alert facilities team via Slack on device outage or emergency state" },

  // ── Energy / Utilities ──
  { label: "Smart Grid Monitoring", category: "Energy / Utilities", prompt: "Smart grid monitoring: MQTT smart meter readings, data quality expectations (drop invalid kwh readings < 0 or > 10000, drop null meter IDs), 15-minute tumbling window demand aggregation per zone, trend detection for sustained demand surge (4 consecutive increases), heartbeat/liveness for meter outage detection (expected every 15 minutes), split/route emergency vs outage vs routine, write to Delta and Slack" },
  { label: "Renewable Forecasting", category: "Energy / Utilities", prompt: "Renewable energy forecasting: Kafka weather sensor data joined with power output stream, window aggregate solar production per inverter every 10 minutes, trend detection for declining output, ML prediction model for next-hour output, write forecasts to Feature Store and Delta" },

  // ── Manufacturing ──
  { label: "Predictive Maintenance", category: "Manufacturing", prompt: "Predictive maintenance: MQTT sensor data from factory equipment, filter for temperature and vibration sensors, trend detection on rising temperature (5 consecutive readings), temporal correlation between temperature spikes and vibration anomalies within 10 minutes, ML failure prediction model, alert maintenance team via PagerDuty, write to Delta" },
  { label: "Quality Control", category: "Manufacturing", prompt: "Quality control: Kafka inspection events, data quality checks on measurement values, count threshold for >3 defects per batch in 1 hour, sequence detector for recurring defect pattern (fail → rework → fail), state machine for batch status (in-progress → inspected → passed/failed/quarantined), write to Unity Catalog" },

  // ── E-commerce / Retail ──
  { label: "Abandoned Cart Recovery", category: "E-commerce / Retail", prompt: "Abandoned cart: Kafka user events, absence detector to find users who add to cart but don't purchase within 1 hour, enrich with customer segment from lookup table, write abandoned cart events to Delta and trigger recovery email campaign" },
  { label: "Real-Time Inventory", category: "E-commerce / Retail", prompt: "Real-time inventory alerts: CDC from inventory database, filter for quantity < reorder threshold, velocity detector for rapid stock depletion (>50 units sold per hour), absence detector for restocking events not received within 24 hours, alert supply chain team via webhook and email" },
  { label: "Clickstream Funnel", category: "E-commerce / Retail", prompt: "Clickstream funnel: Kafka page views, sequence detector for conversion funnel (home → product → cart → checkout with relaxed contiguity within 1 hour), hourly tumbling window conversion count per campaign, write funnel metrics to Delta Lake" },

  // ── Logistics / Supply Chain ──
  { label: "Fleet Tracking", category: "Logistics / Supply Chain", prompt: "Fleet tracking: two MQTT streams (GPS location + speed sensors), stream-stream join on vehicle_id, geofence detection for warehouse polygon zones (enter/exit), velocity detector for speeding (>120 km/h alerts), union all alerts, dispatch via webhook and write to Delta" },
  { label: "Order-to-Cash Lifecycle", category: "Logistics / Supply Chain", prompt: "Order lifecycle tracking: CDC from orders database, sequence detector for full lifecycle (order_placed → payment_received → shipped → delivered within 7 days), absence detector for orders not shipped within 48 hours of payment, email alerts for delays, write tracking events to Delta" },
  { label: "Cold Chain Monitoring", category: "Logistics / Supply Chain", prompt: "Cold chain monitoring: MQTT temperature sensors on refrigerated trucks, data quality to drop readings outside -50 to 50 range, trend detection for rising temperature (5 consecutive increases), count threshold for >3 excursions in 1 hour, state machine for shipment status (in-transit → at-risk → compromised), alert via PagerDuty" },

  // ── Cybersecurity ──
  { label: "Threat Detection", category: "Cybersecurity", prompt: "Security threat detection: Kafka auth logs, count threshold for brute force (>10 failed logins in 5 minutes), sequence detector for credential stuffing (failed_login → successful_login → privilege_escalation within 10 minutes), temporal correlation for impossible travel (same user in two locations within 1 minute), union all threat types, write to Delta and Slack" },
  { label: "DDoS Detection", category: "Cybersecurity", prompt: "DDoS detection: Kafka network flow logs, velocity detector for request spikes (>1000 requests per second per IP), outlier detection on packet sizes, window aggregate request rates per source IP per minute, filter for known-bad IP ranges from lookup table, write incidents to Delta and trigger PagerDuty" },

  // ── SaaS / Operations ──
  { label: "SLA Breach Detection", category: "SaaS / Operations", prompt: "SLA breach detection: Kafka service events, absence detector for requests not completed within 30 minutes, window aggregate response times per service per 5-minute window, trend detection on increasing latency, alert via PagerDuty and write breach events to Delta" },
  { label: "User Session Analytics", category: "SaaS / Operations", prompt: "User session analytics: Kafka clickstream, session detection with 30-minute gap, window aggregate event counts and page views per session, write session summaries to Delta Lake for product analytics" },
  { label: "Feature Flag Impact", category: "SaaS / Operations", prompt: "Feature flag monitoring: Kafka user events, filter for users in experiment group, session detection with 15-minute gap, window aggregate conversion rate per variant per hour, write experiment metrics to Feature Store for model-based analysis" },
];

const CATEGORIES = ["All", ...Array.from(new Set(EXAMPLE_PROMPTS.map((p) => p.category)))];

export default function AIAssistDialog({ isOpen, onClose }: AIAssistDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [showAllExamples, setShowAllExamples] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadPipeline = usePipelineStore((s) => s.loadPipeline);

  const filteredPrompts = useMemo(() => {
    if (category === "All") return EXAMPLE_PROMPTS;
    return EXAMPLE_PROMPTS.filter((p) => p.category === category);
  }, [category]);

  const visiblePrompts = showAllExamples ? filteredPrompts : filteredPrompts.slice(0, 8);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setError(null);
      setCategory("All");
      setShowAllExamples(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim() || prompt.trim().length < 10) {
      setError("Please describe your pipeline in at least 10 characters.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await aiGeneratePipeline(prompt.trim());

      const nodes: Node[] = result.nodes.map((n) => ({
        id: n.id,
        type: "custom",
        position: { x: n.x, y: n.y },
        data: {
          type: n.type,
          label: n.label,
          config: n.config,
          configSummary: "",
        },
      }));

      const edges: Edge[] = result.edges.map((e) => ({
        id: `e-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
      }));

      loadPipeline(nodes, edges, result.name, result.description);
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : err instanceof Error
          ? err.message
          : "An unexpected error occurred";
      setError(msg ?? "Failed to generate pipeline. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-lg border border-[#30363d] bg-[#161b22] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#30363d] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#e8eaed]">AI Pipeline Generator</h2>
              <p className="text-xs text-[#8b949e]">Powered by Claude Sonnet on Databricks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Prompt input */}
        <div className="p-5">
          <label htmlFor="ai-prompt" className="mb-2 block text-sm font-medium text-[#c9d1d9]">
            Describe your streaming pipeline
          </label>
          <div className="relative">
            <textarea
              ref={inputRef}
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Build a fraud detection pipeline that reads credit card transactions from Kafka, detects rapid-fire transactions from the same card, and sends alerts..."
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-4 py-3 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#1f6feb] focus:outline-none focus:ring-1 focus:ring-[#1f6feb] resize-none"
              rows={4}
              disabled={isGenerating}
            />
          </div>
          <p className="mt-1.5 text-xs text-[#484f58]">
            Press <kbd className="rounded border border-[#30363d] bg-[#21262d] px-1 py-0.5 text-[10px]">⌘</kbd>+<kbd className="rounded border border-[#30363d] bg-[#21262d] px-1 py-0.5 text-[10px]">Enter</kbd> to generate
          </p>

          {error && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Example prompts */}
        <div className="border-t border-[#30363d] px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#8b949e]">
              <Lightbulb className="h-3.5 w-3.5" />
              Example prompts
              <span className="ml-1 rounded-full bg-[#30363d] px-1.5 py-0.5 text-[10px] tabular-nums">
                {filteredPrompts.length}
              </span>
            </div>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setShowAllExamples(false); }}
                className="appearance-none rounded-md border border-[#30363d] bg-[#21262d] py-1 pl-2.5 pr-7 text-[11px] text-[#8b949e] focus:border-[#58a6ff] focus:outline-none cursor-pointer"
                disabled={isGenerating}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#484f58]" />
            </div>
          </div>
          <div className="flex max-h-[160px] flex-wrap gap-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {visiblePrompts.map((example, i) => (
              <button
                key={`${category}-${i}`}
                onClick={() => setPrompt(example.prompt)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  prompt === example.prompt
                    ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
                    : "border-[#30363d] bg-[#21262d] text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9]"
                )}
                title={example.prompt}
                disabled={isGenerating}
              >
                {example.label}
              </button>
            ))}
            {!showAllExamples && filteredPrompts.length > 8 && (
              <button
                onClick={() => setShowAllExamples(true)}
                className="rounded-full border border-dashed border-[#30363d] px-3 py-1 text-xs text-[#58a6ff] hover:border-[#58a6ff] hover:text-[#79c0ff] transition-colors"
                disabled={isGenerating}
              >
                +{filteredPrompts.length - 8} more
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-[#30363d] px-5 py-4">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-all",
              isGenerating
                ? "bg-purple-600/50 text-purple-200 cursor-wait"
                : "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating pipeline...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Pipeline
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
