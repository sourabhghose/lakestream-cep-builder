import type { PipelineDefinition, PipelineNode, PipelineEdge } from "@/types/pipeline";

export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

export interface PipelineTemplate extends PipelineDefinition {
  industry: string;
  difficulty: TemplateDifficulty;
}

function createNode(
  id: string,
  type: string,
  x: number,
  y: number,
  config: Record<string, unknown> = {},
  label?: string
): PipelineNode {
  return {
    id,
    type: "custom",
    position: { x, y },
    data: {
      type: type as PipelineNode["data"]["type"],
      label: label ?? id,
      config,
      configSummary: "",
    },
  };
}

function createEdge(source: string, target: string): PipelineEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
  };
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "fraud-detection",
    name: "Fraud Detection",
    description:
      "Detect suspicious transaction patterns: high-value transactions, velocity anomalies, and login→transfer→logout sequences within 2 minutes.",
    industry: "FinServ",
    difficulty: "advanced",
    nodes: [
      createNode("kafka-1", "kafka-topic", 0, 0, {
        bootstrapServers: "broker1:9092,broker2:9092",
        topics: "transactions",
        consumerGroup: "fraud-detection-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }),
      createNode("filter-1", "filter", 180, 0, {
        condition: "amount > 1000",
      }),
      createNode("velocity-1", "velocity-detector", 360, 0, {
        eventFilter: "event_type = 'transaction'",
        rateThreshold: 5,
        rateUnit: "per_min",
        windowDuration: { value: 1, unit: "minutes" },
      }),
      createNode("seq-1", "sequence-detector", 540, 0, {
        steps: [
          { name: "login", filter: "event_type = 'login'" },
          { name: "transfer", filter: "event_type = 'transfer'" },
          { name: "logout", filter: "event_type = 'logout'" },
        ],
        contiguityMode: "relaxed",
        withinDuration: { value: 2, unit: "minutes" },
      }),
      createNode("delta-1", "delta-table-sink", 720, 0, {
        catalog: "main",
        schema: "alerts",
        table: "fraud_alerts",
        writeMode: "append",
      }),
      createNode("slack-1", "slack-teams-pagerduty", 720, 120, {
        provider: "slack",
        webhookUrl: "https://hooks.slack.com/services/xxx",
        messageTemplate: "Fraud alert: {{message}} at {{timestamp}}",
      }),
    ],
    edges: [
      createEdge("kafka-1", "filter-1"),
      createEdge("filter-1", "velocity-1"),
      createEdge("velocity-1", "seq-1"),
      createEdge("seq-1", "delta-1"),
      createEdge("seq-1", "slack-1"),
    ],
  },
  {
    id: "abandoned-cart",
    name: "Abandoned Cart",
    description:
      "Detect when users add items to cart but don't complete purchase within 1 hour. Sends email recovery campaigns.",
    industry: "E-commerce",
    difficulty: "beginner",
    nodes: [
      createNode("kafka-2", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "user_events",
        consumerGroup: "abandoned-cart-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }),
      createNode("absence-1", "absence-detector", 200, 0, {
        triggerEventFilter: "event_type = 'add_to_cart'",
        expectedEventFilter: "event_type = 'purchase'",
        timeoutDuration: { value: 1, unit: "hours" },
        withinDuration: { value: 2, unit: "hours" },
      }),
      createNode("delta-2", "delta-table-sink", 400, 0, {
        catalog: "main",
        schema: "ecommerce",
        table: "abandoned_carts",
        writeMode: "append",
      }),
      createNode("email-1", "email-sink", 400, 100, {
        smtpProvider: "sendgrid",
        to: "recovery@example.com",
        subjectTemplate: "Abandoned cart: {{user_id}}",
        bodyTemplate: "User {{user_id}} abandoned cart at {{timestamp}}",
      }),
    ],
    edges: [
      createEdge("kafka-2", "absence-1"),
      createEdge("absence-1", "delta-2"),
      createEdge("absence-1", "email-1"),
    ],
  },
  {
    id: "predictive-maintenance",
    name: "Predictive Maintenance",
    description:
      "Correlate temperature rise with vibration spikes to predict equipment failure. Triggers PagerDuty for maintenance.",
    industry: "Manufacturing",
    difficulty: "advanced",
    nodes: [
      createNode("mqtt-1", "mqtt", 0, 0, {
        brokerUrl: "tcp://broker:1883",
        topicFilter: "sensors/+/data",
        qos: "1",
        clientId: "maintenance-mqtt-client",
      }),
      createNode("filter-temp", "filter", 120, -60, {
        condition: "sensor_type = 'temperature'",
      }),
      createNode("filter-vib", "filter", 120, 60, {
        condition: "sensor_type = 'vibration'",
      }),
      createNode("trend-1", "trend-detector", 260, -60, {
        valueField: "temperature",
        direction: "up",
        consecutiveCount: 5,
        tolerancePercent: 5,
      }),
      createNode("temporal-1", "temporal-correlation", 400, 0, {
        streamAFilter: "sensor_type = 'temperature'",
        streamBFilter: "sensor_type = 'vibration'",
        correlationKey: "machine_id",
        maxTimeGap: { value: 10, unit: "minutes" },
      }),
      createNode("delta-3", "delta-table-sink", 540, 0, {
        catalog: "main",
        schema: "maintenance",
        table: "maintenance_alerts",
        writeMode: "append",
      }),
      createNode("pagerduty-1", "slack-teams-pagerduty", 540, 100, {
        provider: "pagerduty",
        webhookUrl: "https://events.pagerduty.com/xxx",
        messageTemplate: "Maintenance alert: {{machine_id}} - {{message}}",
      }),
    ],
    edges: [
      createEdge("mqtt-1", "filter-temp"),
      createEdge("mqtt-1", "filter-vib"),
      createEdge("filter-temp", "trend-1"),
      createEdge("trend-1", "temporal-1"),
      createEdge("filter-vib", "temporal-1"),
      createEdge("temporal-1", "delta-3"),
      createEdge("temporal-1", "pagerduty-1"),
    ],
  },
  {
    id: "realtime-anomaly",
    name: "Real-Time Anomaly Detection",
    description:
      "Detect metric anomalies using z-score (>3 std devs) with 1hr baseline. Alerts to Slack.",
    industry: "Any",
    difficulty: "intermediate",
    nodes: [
      createNode("kafka-3", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "metrics",
        consumerGroup: "anomaly-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }),
      createNode("outlier-1", "outlier-anomaly", 200, 0, {
        valueField: "value",
        baselineWindow: { value: 1, unit: "hours" },
        thresholdStdDevs: 3,
        algorithm: "z-score",
      }),
      createNode("delta-4", "delta-table-sink", 400, 0, {
        catalog: "main",
        schema: "monitoring",
        table: "anomalies",
        writeMode: "append",
      }),
      createNode("slack-2", "slack-teams-pagerduty", 400, 100, {
        provider: "slack",
        webhookUrl: "https://hooks.slack.com/services/xxx",
        messageTemplate: "Anomaly: {{metric}} = {{value}} at {{timestamp}}",
      }),
    ],
    edges: [
      createEdge("kafka-3", "outlier-1"),
      createEdge("outlier-1", "delta-4"),
      createEdge("outlier-1", "slack-2"),
    ],
  },
  {
    id: "user-session-analytics",
    name: "User Session Analytics",
    description:
      "Group clickstream events into 30-min sessions and aggregate event counts per session.",
    industry: "SaaS",
    difficulty: "intermediate",
    nodes: [
      createNode("kafka-4", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "clickstream",
        consumerGroup: "session-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }),
      createNode("session-1", "session-detector", 180, 0, {
        sessionKey: "user_id",
        gapDuration: { value: 30, unit: "minutes" },
      }),
      createNode("window-1", "window-aggregate", 360, 0, {
        windowType: "session",
        duration: { value: 30, unit: "minutes" },
        groupByKeys: "session_id",
        aggregations: [
          { column: "event_id", function: "count" },
          { column: "user_id", function: "count" },
        ],
      }),
      createNode("delta-5", "delta-table-sink", 540, 0, {
        catalog: "main",
        schema: "analytics",
        table: "sessions",
        writeMode: "append",
      }),
    ],
    edges: [
      createEdge("kafka-4", "session-1"),
      createEdge("session-1", "window-1"),
      createEdge("window-1", "delta-5"),
    ],
  },
  {
    id: "sla-breach-detection",
    name: "SLA Breach Detection",
    description:
      "Detect when service requests don't complete within 30 minutes of start. Alerts to PagerDuty.",
    industry: "Operations",
    difficulty: "beginner",
    nodes: [
      createNode("kafka-5", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "service_events",
        consumerGroup: "sla-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }),
      createNode("absence-2", "absence-detector", 200, 0, {
        triggerEventFilter: "event_type = 'request_start'",
        expectedEventFilter: "event_type = 'request_complete'",
        timeoutDuration: { value: 30, unit: "minutes" },
        withinDuration: { value: 1, unit: "hours" },
      }),
      createNode("delta-6", "delta-table-sink", 400, 0, {
        catalog: "main",
        schema: "ops",
        table: "sla_breaches",
        writeMode: "append",
      }),
      createNode("pagerduty-2", "slack-teams-pagerduty", 400, 100, {
        provider: "pagerduty",
        webhookUrl: "https://events.pagerduty.com/xxx",
        messageTemplate: "SLA breach: {{request_id}} - no completion in 30 min",
      }),
    ],
    edges: [
      createEdge("kafka-5", "absence-2"),
      createEdge("absence-2", "delta-6"),
      createEdge("absence-2", "pagerduty-2"),
    ],
  },
  {
    id: "clickstream-funnel",
    name: "Clickstream Funnel",
    description:
      "Track conversion funnel: home→product→cart→checkout with relaxed contiguity in 1hr. Aggregate conversion rate per hour.",
    industry: "Marketing",
    difficulty: "intermediate",
    nodes: [
      createNode("kafka-6", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "page_views",
        consumerGroup: "funnel-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }),
      createNode("seq-2", "sequence-detector", 180, 0, {
        steps: [
          { name: "home", filter: "page = 'home'" },
          { name: "product", filter: "page = 'product'" },
          { name: "cart", filter: "page = 'cart'" },
          { name: "checkout", filter: "page = 'checkout'" },
        ],
        contiguityMode: "relaxed",
        withinDuration: { value: 1, unit: "hours" },
      }),
      createNode("window-2", "window-aggregate", 360, 0, {
        windowType: "tumbling",
        duration: { value: 1, unit: "hours" },
        aggregations: [
          { column: "match_id", function: "count" },
          { column: "user_id", function: "count" },
        ],
      }),
      createNode("delta-7", "delta-table-sink", 540, 0, {
        catalog: "main",
        schema: "marketing",
        table: "funnel_metrics",
        writeMode: "append",
      }),
    ],
    edges: [
      createEdge("kafka-6", "seq-2"),
      createEdge("seq-2", "window-2"),
      createEdge("window-2", "delta-7"),
    ],
  },
  {
    id: "fleet-monitoring",
    name: "Fleet Monitoring",
    description:
      "Monitor vehicle GPS: geofence enter/exit at warehouse, speed >120 km/h. Dispatch alerts via webhook.",
    industry: "Logistics",
    difficulty: "advanced",
    nodes: [
      createNode("mqtt-2", "mqtt", 0, 0, {
        brokerUrl: "tcp://broker:1883",
        topicFilter: "vehicles/+/gps",
        qos: "1",
        clientId: "fleet-mqtt-client",
      }),
      createNode("geofence-1", "geofence-location", 180, 0, {
        latField: "latitude",
        lonField: "longitude",
        geofenceType: "polygon",
        polygonVertices: "[[37.5,-122.3],[37.6,-122.3],[37.6,-122.2],[37.5,-122.2]]",
        trigger: "enter",
      }),
      createNode("velocity-2", "velocity-detector", 180, 120, {
        eventFilter: "speed > 120",
        rateThreshold: 1,
        rateUnit: "per_min",
        windowDuration: { value: 1, unit: "minutes" },
      }),
      createNode("union-1", "union-merge", 360, 60, {}),
      createNode("delta-8", "delta-table-sink", 540, 60, {
        catalog: "main",
        schema: "fleet",
        table: "fleet_events",
        writeMode: "append",
      }),
      createNode("webhook-1", "rest-webhook-sink", 540, 160, {
        url: "https://api.dispatch.example.com/alerts",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    ],
    edges: [
      createEdge("mqtt-2", "geofence-1"),
      createEdge("mqtt-2", "velocity-2"),
      createEdge("geofence-1", "union-1"),
      createEdge("velocity-2", "union-1"),
      createEdge("union-1", "delta-8"),
      createEdge("union-1", "webhook-1"),
    ],
  },
  {
    id: "security-threat-detection",
    name: "Security Threat Detection",
    description:
      "Detect brute force (>10 failed logins in 5 min), credential stuffing sequence, and impossible travel (2 locations in 1 min).",
    industry: "Cybersecurity",
    difficulty: "advanced",
    nodes: [
      createNode("kafka-7", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "auth_logs",
        consumerGroup: "security-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }),
      createNode("count-1", "count-threshold", 180, 0, {
        eventFilter: "event_type = 'failed_login'",
        thresholdCount: 10,
        windowDuration: { value: 5, unit: "minutes" },
      }),
      createNode("seq-3", "sequence-detector", 360, 0, {
        steps: [
          { name: "failed", filter: "event_type = 'failed_login'" },
          { name: "success", filter: "event_type = 'successful_login'" },
          { name: "escalation", filter: "event_type = 'privilege_escalation'" },
        ],
        contiguityMode: "relaxed",
        withinDuration: { value: 10, unit: "minutes" },
      }),
      createNode("temporal-2", "temporal-correlation", 360, 120, {
        streamAFilter: "location = 'loc_a'",
        streamBFilter: "location = 'loc_b'",
        correlationKey: "user_id",
        maxTimeGap: { value: 1, unit: "minutes" },
      }),
      createNode("union-2a", "union-merge", 480, 30, {}),
      createNode("union-2", "union-merge", 600, 60, {}),
      createNode("delta-9", "delta-table-sink", 720, 60, {
        catalog: "main",
        schema: "security",
        table: "threats",
        writeMode: "append",
      }),
      createNode("slack-3", "slack-teams-pagerduty", 720, 160, {
        provider: "slack",
        webhookUrl: "https://hooks.slack.com/services/xxx",
        messageTemplate: "Security threat: {{threat_type}} - {{user_id}}",
      }),
    ],
    edges: [
      createEdge("kafka-7", "count-1"),
      createEdge("kafka-7", "seq-3"),
      createEdge("kafka-7", "temporal-2"),
      createEdge("count-1", "union-2a"),
      createEdge("seq-3", "union-2a"),
      createEdge("union-2a", "union-2"),
      createEdge("temporal-2", "union-2"),
      createEdge("union-2", "delta-9"),
      createEdge("union-2", "slack-3"),
    ],
  },
  {
    id: "order-to-cash-tracking",
    name: "Order-to-Cash Tracking",
    description:
      "Track order lifecycle: order_placed→payment→shipped→delivered in 7 days. Flag orders not shipped within 48hr of payment.",
    industry: "Supply Chain",
    difficulty: "advanced",
    nodes: [
      createNode("cdc-1", "cdc-stream", 0, 0, {
        kafkaTopic: "db.orders.events",
        cdcFormat: "debezium",
        primaryKeys: "order_id",
      }),
      createNode("seq-4", "sequence-detector", 200, 0, {
        steps: [
          { name: "placed", filter: "status = 'order_placed'" },
          { name: "paid", filter: "status = 'payment_received'" },
          { name: "shipped", filter: "status = 'shipped'" },
          { name: "delivered", filter: "status = 'delivered'" },
        ],
        contiguityMode: "relaxed",
        withinDuration: { value: 7, unit: "days" },
      }),
      createNode("absence-3", "absence-detector", 200, 120, {
        triggerEventFilter: "status = 'payment_received'",
        expectedEventFilter: "status = 'shipped'",
        timeoutDuration: { value: 48, unit: "hours" },
        withinDuration: { value: 3, unit: "days" },
      }),
      createNode("union-3", "union-merge", 400, 60, {}),
      createNode("delta-10", "delta-table-sink", 600, 60, {
        catalog: "main",
        schema: "orders",
        table: "order_tracking",
        writeMode: "append",
      }),
      createNode("email-2", "email-sink", 600, 160, {
        smtpProvider: "sendgrid",
        to: "ops@example.com",
        subjectTemplate: "Order delay: {{order_id}}",
        bodyTemplate: "Order {{order_id}} not shipped within 48hr of payment",
      }),
    ],
    edges: [
      createEdge("cdc-1", "seq-4"),
      createEdge("cdc-1", "absence-3"),
      createEdge("seq-4", "union-3"),
      createEdge("absence-3", "union-3"),
      createEdge("union-3", "delta-10"),
      createEdge("absence-3", "email-2"),
    ],
  },
  {
    id: "trucking-iot-analytics",
    name: "Trucking IoT Analytics",
    description:
      "Monitor a fleet of trucks in real time: join geo-location and speed sensor streams, detect speeding violations (avg speed > 80 mph over 3-min windows), trigger alerts, apply ML predictions, and sink to Lakebase for BI.",
    industry: "Transportation",
    difficulty: "advanced",
    nodes: [
      // Two Kafka sources for the two sensor streams
      createNode("kafka-geo", "kafka-topic", 0, 0, {
        bootstrapServers: "broker1:9092,broker2:9092",
        topics: "truck_geo_events",
        consumerGroup: "trucking-iot-consumer",
        startingOffset: "latest",
        schemaSource: "schema-registry",
        deserializationFormat: "avro",
      }, "Truck Geo Events"),
      createNode("kafka-speed", "kafka-topic", 0, 180, {
        bootstrapServers: "broker1:9092,broker2:9092",
        topics: "truck_speed_events",
        consumerGroup: "trucking-iot-consumer",
        startingOffset: "latest",
        schemaSource: "schema-registry",
        deserializationFormat: "avro",
      }, "Truck Speed Events"),

      // Join the two streams on driver_id with a 5-second watermark
      createNode("join-drivers", "stream-stream-join", 280, 80, {
        joinType: "inner",
        leftKey: "driver_id",
        rightKey: "driver_id",
        watermarkColumn: "event_time",
        watermarkDelay: "5 seconds",
      }, "Join on Driver ID"),

      // Filter for violation events only
      createNode("filter-violations", "filter", 520, 80, {
        condition: "event_type != 'normal'",
      }, "Violation Events"),

      // Windowed aggregate: average speed over 3-min tumbling window
      createNode("avg-speed", "window-aggregate", 520, 260, {
        windowType: "tumbling",
        windowDuration: { value: 3, unit: "minutes" },
        groupByColumns: "driver_id, driver_name",
        aggregations: [
          { column: "speed", function: "avg", alias: "avg_speed" },
        ],
      }, "Avg Speed (3 min)"),

      // Rule: flag drivers whose 3-min average exceeds 80 mph
      createNode("filter-speeding", "filter", 760, 260, {
        condition: "avg_speed > 80",
      }, "Speeding Drivers"),

      // Alert via email when speeding detected
      createNode("email-alert", "email-sink", 1000, 200, {
        smtpProvider: "sendgrid",
        to: "fleet-ops@example.com",
        subjectTemplate: "Speeding Alert: Driver {{driver_name}}",
        bodyTemplate: "Driver {{driver_name}} (ID {{driver_id}}) averaged {{avg_speed}} mph over a 3-min window. Immediate attention required.",
      }, "Email Alert"),

      // Alert via Slack/PagerDuty
      createNode("slack-alert", "slack-teams-pagerduty", 1000, 340, {
        provider: "pagerduty",
        webhookUrl: "https://events.pagerduty.com/v2/enqueue",
        messageTemplate: "🚨 Driver {{driver_name}} exceeding speed limit: {{avg_speed}} mph average",
      }, "PagerDuty Alert"),

      // ML prediction: likelihood of driver committing a violation
      createNode("ml-predict", "ml-model-endpoint", 760, 80, {
        endpointName: "driver-violation-prediction",
        inputColumns: "driver_id, speed, route_id, event_type",
        outputColumn: "violation_probability",
        outputType: "DoubleType()",
        timeout: 5000,
        fallbackValue: "-1.0",
      }, "Violation Prediction"),

      // Sink all violation events to lakebase for BI analytics
      createNode("lakebase-violations", "lakebase-sink", 1000, 0, {
        catalog: "main",
        schema: "trucking",
        tableName: "violation_events",
        tableType: "streaming-table",
        writeMode: "append",
        checkpointLocation: "/checkpoints/trucking/violations",
      }, "Violation Events Table"),

      // Sink ML-scored events to a separate analytics table
      createNode("lakebase-predictions", "lakebase-sink", 1000, 100, {
        catalog: "main",
        schema: "trucking",
        tableName: "driver_risk_scores",
        tableType: "streaming-table",
        writeMode: "append",
        checkpointLocation: "/checkpoints/trucking/risk_scores",
      }, "Risk Scores Table"),
    ],
    edges: [
      // Two Kafka sources → Stream-Stream Join
      createEdge("kafka-geo", "join-drivers"),
      createEdge("kafka-speed", "join-drivers"),
      // Join → Filter violations
      createEdge("join-drivers", "filter-violations"),
      createEdge("filter-violations", "ml-predict"),
      createEdge("ml-predict", "lakebase-predictions"),
      createEdge("filter-violations", "lakebase-violations"),
      // Violations → windowed avg speed → speeding filter → alerts
      createEdge("filter-violations", "avg-speed"),
      createEdge("avg-speed", "filter-speeding"),
      createEdge("filter-speeding", "email-alert"),
      createEdge("filter-speeding", "slack-alert"),
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // NEW ADVANCED TEMPLATES (8)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "patient-vitals-monitoring",
    name: "Patient Vitals Monitoring",
    description:
      "Real-time ICU monitoring: detect silent monitors via heartbeat/liveness, track patient state transitions (stable→warning→critical→code blue), trend detection on vitals, ML severity prediction, and multi-channel alerts.",
    industry: "Healthcare",
    difficulty: "advanced",
    nodes: [
      createNode("mqtt-vitals", "mqtt", 0, 0, {
        brokerUrl: "tcp://hospital-broker:1883",
        topicFilter: "icu/+/vitals",
        qos: "1",
        clientId: "icu-vitals-consumer",
      }, "ICU Vitals Stream"),
      createNode("watermark-vitals", "watermark", 200, 0, {
        timestampColumn: "event_time",
        delayThreshold: { value: 5, unit: "seconds" },
      }, "Watermark (5s)"),
      createNode("heartbeat-monitor", "heartbeat-liveness", 200, 150, {
        entityKey: "device_id",
        expectedInterval: { value: 30, unit: "seconds" },
        gracePeriod: { value: 10, unit: "seconds" },
        outputMode: "dead-only",
      }, "Silent Monitor Alert"),
      createNode("trend-vitals", "trend-detector", 420, -60, {
        valueField: "heart_rate",
        direction: "up",
        consecutiveCount: 5,
        tolerancePercent: 10,
      }, "Heart Rate Trend"),
      createNode("state-patient", "state-machine", 420, 60, {
        states: '["stable", "warning", "critical", "code_blue"]',
        transitions: '[{"from":"stable","to":"warning","condition":"heart_rate > 100 OR spo2 < 92"},{"from":"warning","to":"critical","condition":"heart_rate > 130 OR spo2 < 85"},{"from":"critical","to":"code_blue","condition":"heart_rate > 150 OR spo2 < 75"},{"from":"warning","to":"stable","condition":"heart_rate < 90 AND spo2 > 95"},{"from":"critical","to":"warning","condition":"heart_rate < 120 AND spo2 > 88"}]',
        keyColumn: "patient_id",
        emitOn: "transition",
        terminalStates: "code_blue",
        stateTimeout: { value: 60, unit: "minutes" },
      }, "Patient State Machine"),
      createNode("ml-severity", "ml-model-endpoint", 640, -60, {
        endpointName: "patient-severity-model",
        inputColumns: "heart_rate, spo2, blood_pressure, temperature",
        outputColumn: "severity_score",
        outputType: "DoubleType()",
        timeout: 3000,
        fallbackValue: "-1.0",
      }, "Severity Prediction"),
      createNode("split-severity", "split-router", 640, 60, {
        routes: '[{"name":"critical","condition":"current_state IN (\'critical\',\'code_blue\')"},{"name":"warning","condition":"current_state = \'warning\'"}]',
        defaultRoute: "routine",
      }, "Route by Severity"),
      createNode("pagerduty-critical", "slack-teams-pagerduty", 880, 0, {
        provider: "pagerduty",
        webhookUrl: "https://events.pagerduty.com/v2/enqueue",
        messageTemplate: "CODE BLUE: Patient {{patient_id}} — {{current_state}} — HR: {{heart_rate}}, SpO2: {{spo2}}",
      }, "PagerDuty (Critical)"),
      createNode("delta-vitals", "delta-table-sink", 880, 120, {
        catalog: "main",
        schema: "healthcare",
        table: "patient_vitals_events",
        writeMode: "append",
      }, "Vitals History"),
      createNode("delta-silent", "delta-table-sink", 420, 240, {
        catalog: "main",
        schema: "healthcare",
        table: "silent_device_alerts",
        writeMode: "append",
      }, "Silent Device Log"),
    ],
    edges: [
      createEdge("mqtt-vitals", "watermark-vitals"),
      createEdge("mqtt-vitals", "heartbeat-monitor"),
      createEdge("watermark-vitals", "trend-vitals"),
      createEdge("watermark-vitals", "state-patient"),
      createEdge("trend-vitals", "ml-severity"),
      createEdge("state-patient", "split-severity"),
      createEdge("ml-severity", "delta-vitals"),
      createEdge("split-severity", "pagerduty-critical"),
      createEdge("split-severity", "delta-vitals"),
      createEdge("heartbeat-monitor", "delta-silent"),
    ],
  },

  {
    id: "telecom-network-anomaly",
    name: "Network Anomaly Detection",
    description:
      "Monitor cell tower KPIs: detect outlier latency, velocity of handoff failures, and absent tower heartbeats. Watermark for out-of-order telemetry. Route critical vs warning alerts.",
    industry: "Telecom",
    difficulty: "advanced",
    nodes: [
      createNode("kafka-towers", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "cell_tower_metrics",
        consumerGroup: "telecom-anomaly-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }, "Tower Metrics"),
      createNode("watermark-towers", "watermark", 200, 0, {
        timestampColumn: "event_time",
        delayThreshold: { value: 15, unit: "seconds" },
      }, "Watermark (15s)"),
      createNode("outlier-latency", "outlier-anomaly", 420, -80, {
        valueField: "latency_ms",
        baselineWindow: { value: 30, unit: "minutes" },
        thresholdStdDevs: 3,
        algorithm: "z-score",
      }, "Latency Outlier"),
      createNode("velocity-handoff", "velocity-detector", 420, 40, {
        eventFilter: "event_type = 'handoff_failure'",
        rateThreshold: 10,
        rateUnit: "per_min",
        windowDuration: { value: 5, unit: "minutes" },
      }, "Handoff Failure Spike"),
      createNode("heartbeat-towers", "heartbeat-liveness", 420, 160, {
        entityKey: "tower_id",
        expectedInterval: { value: 2, unit: "minutes" },
        gracePeriod: { value: 30, unit: "seconds" },
        outputMode: "dead-only",
      }, "Tower Heartbeat"),
      createNode("union-telecom", "union-merge", 640, 40, {}),
      createNode("split-telecom", "split-router", 820, 40, {
        routes: '[{"name":"critical","condition":"severity = \'critical\' OR is_alive = false"},{"name":"warning","condition":"severity = \'warning\'"}]',
        defaultRoute: "info",
      }, "Route by Severity"),
      createNode("delta-telecom", "delta-table-sink", 1020, 0, {
        catalog: "main",
        schema: "telecom",
        table: "network_anomalies",
        writeMode: "append",
      }, "Anomaly History"),
      createNode("pagerduty-telecom", "slack-teams-pagerduty", 1020, 100, {
        provider: "pagerduty",
        webhookUrl: "https://events.pagerduty.com/v2/enqueue",
        messageTemplate: "Network Alert: Tower {{tower_id}} — {{alert_type}}",
      }, "NOC Alert"),
    ],
    edges: [
      createEdge("kafka-towers", "watermark-towers"),
      createEdge("watermark-towers", "outlier-latency"),
      createEdge("watermark-towers", "velocity-handoff"),
      createEdge("kafka-towers", "heartbeat-towers"),
      createEdge("outlier-latency", "union-telecom"),
      createEdge("velocity-handoff", "union-telecom"),
      createEdge("heartbeat-towers", "union-telecom"),
      createEdge("union-telecom", "split-telecom"),
      createEdge("split-telecom", "delta-telecom"),
      createEdge("split-telecom", "pagerduty-telecom"),
    ],
  },

  {
    id: "energy-grid-monitoring",
    name: "Energy Grid Monitoring",
    description:
      "Smart meter analytics: aggregate demand per zone in 15-min windows, detect consumption trends, alert on meter outages, data quality validation on readings, route alerts by priority.",
    industry: "Energy / Utilities",
    difficulty: "advanced",
    nodes: [
      createNode("mqtt-meters", "mqtt", 0, 0, {
        brokerUrl: "tcp://utility-broker:1883",
        topicFilter: "meters/+/readings",
        qos: "1",
        clientId: "grid-monitor-consumer",
      }, "Smart Meter Readings"),
      createNode("dq-meters", "data-quality-expectations", 200, 0, {
        expectations: '[{"name":"valid_reading","constraint":"kwh >= 0 AND kwh < 10000","action":"drop"},{"name":"has_meter_id","constraint":"meter_id IS NOT NULL","action":"drop"}]',
        quarantineTable: "main.energy.quarantine_readings",
      }, "Data Quality Check"),
      createNode("window-demand", "window-aggregate", 420, -80, {
        windowType: "tumbling",
        windowDuration: { value: 15, unit: "minutes" },
        groupByColumns: "zone_id",
        aggregations: [
          { column: "kwh", function: "sum", alias: "total_kwh" },
          { column: "meter_id", function: "count", alias: "active_meters" },
        ],
      }, "Zone Demand (15min)"),
      createNode("trend-demand", "trend-detector", 640, -80, {
        valueField: "total_kwh",
        direction: "up",
        consecutiveCount: 4,
        tolerancePercent: 15,
      }, "Demand Surge Trend"),
      createNode("heartbeat-meters", "heartbeat-liveness", 420, 80, {
        entityKey: "meter_id",
        expectedInterval: { value: 15, unit: "minutes" },
        gracePeriod: { value: 5, unit: "minutes" },
        outputMode: "dead-only",
      }, "Meter Outage Detect"),
      createNode("union-grid", "union-merge", 820, 0, {}),
      createNode("split-grid", "split-router", 1000, 0, {
        routes: '[{"name":"emergency","condition":"alert_type = \'surge\' AND total_kwh > 50000"},{"name":"outage","condition":"is_alive = false"}]',
        defaultRoute: "routine",
      }, "Priority Router"),
      createNode("delta-grid", "delta-table-sink", 1200, -40, {
        catalog: "main",
        schema: "energy",
        table: "grid_events",
        writeMode: "append",
      }, "Grid Events"),
      createNode("slack-grid", "slack-teams-pagerduty", 1200, 60, {
        provider: "slack",
        webhookUrl: "https://hooks.slack.com/services/xxx",
        messageTemplate: "Grid Alert: Zone {{zone_id}} — {{alert_type}}: {{message}}",
      }, "Ops Alert"),
    ],
    edges: [
      createEdge("mqtt-meters", "dq-meters"),
      createEdge("dq-meters", "window-demand"),
      createEdge("dq-meters", "heartbeat-meters"),
      createEdge("window-demand", "trend-demand"),
      createEdge("trend-demand", "union-grid"),
      createEdge("heartbeat-meters", "union-grid"),
      createEdge("union-grid", "split-grid"),
      createEdge("split-grid", "delta-grid"),
      createEdge("split-grid", "slack-grid"),
    ],
  },

  {
    id: "player-behavior-analytics",
    name: "Player Behavior Analytics",
    description:
      "Gaming analytics: session detection, achievement sequence tracking (tutorial→first_kill→first_win), cheat detection (>50 kills in 1 min), real-time feature store for ML matchmaking.",
    industry: "Gaming",
    difficulty: "advanced",
    nodes: [
      createNode("kafka-game", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "game_events",
        consumerGroup: "game-analytics-consumer",
        startingOffset: "latest",
        schemaSource: "infer",
        deserializationFormat: "json",
      }, "Game Events"),
      createNode("dedup-game", "deduplication", 200, 0, {
        deduplicationKey: "event_id",
        watermarkDuration: { value: 5, unit: "minutes" },
      }, "Dedup Events"),
      createNode("session-game", "session-detector", 400, -100, {
        sessionKey: "player_id",
        gapDuration: { value: 15, unit: "minutes" },
      }, "Play Sessions"),
      createNode("seq-achieve", "sequence-detector", 400, 20, {
        steps: [
          { name: "tutorial", filter: "event_type = 'tutorial_complete'" },
          { name: "first_kill", filter: "event_type = 'first_kill'" },
          { name: "first_win", filter: "event_type = 'first_win'" },
        ],
        contiguityMode: "relaxed",
        withinDuration: { value: 24, unit: "hours" },
      }, "Achievement Sequence"),
      createNode("count-cheat", "count-threshold", 400, 150, {
        eventFilter: "event_type = 'kill'",
        thresholdCount: 50,
        windowDuration: { value: 1, unit: "minutes" },
      }, "Cheat Detection"),
      createNode("window-session", "window-aggregate", 620, -100, {
        windowType: "session",
        duration: { value: 15, unit: "minutes" },
        groupByKeys: "player_id",
        aggregations: [
          { column: "event_id", function: "count", alias: "events_per_session" },
          { column: "xp_gained", function: "sum", alias: "total_xp" },
        ],
      }, "Session Metrics"),
      createNode("feature-store-game", "feature-store-sink", 840, -100, {
        featureTableName: "main.gaming.player_features",
        primaryKeys: "player_id",
        timestampKey: "session_end_time",
        description: "Real-time player features for matchmaking model",
        writeMode: "merge",
      }, "Player Feature Store"),
      createNode("delta-game", "delta-table-sink", 840, 20, {
        catalog: "main",
        schema: "gaming",
        table: "player_achievements",
        writeMode: "append",
      }, "Achievements Log"),
      createNode("slack-cheat", "slack-teams-pagerduty", 620, 250, {
        provider: "slack",
        webhookUrl: "https://hooks.slack.com/services/xxx",
        messageTemplate: "Cheat Alert: Player {{player_id}} — {{kill_count}} kills in 1 min",
      }, "Anti-Cheat Alert"),
      createNode("delta-cheat", "delta-table-sink", 840, 150, {
        catalog: "main",
        schema: "gaming",
        table: "cheat_detections",
        writeMode: "append",
      }, "Cheat Log"),
    ],
    edges: [
      createEdge("kafka-game", "dedup-game"),
      createEdge("dedup-game", "session-game"),
      createEdge("dedup-game", "seq-achieve"),
      createEdge("dedup-game", "count-cheat"),
      createEdge("session-game", "window-session"),
      createEdge("window-session", "feature-store-game"),
      createEdge("seq-achieve", "delta-game"),
      createEdge("count-cheat", "slack-cheat"),
      createEdge("count-cheat", "delta-cheat"),
    ],
  },

  {
    id: "insurance-claims-triage",
    name: "Insurance Claims Triage",
    description:
      "Claims processing: CDC from claims DB, state machine (filed→review→approved/denied/escalated), data quality on claim amounts, split/route by severity, SLA breach detection for stale claims.",
    industry: "Insurance",
    difficulty: "advanced",
    nodes: [
      createNode("cdc-claims", "cdc-stream", 0, 0, {
        kafkaTopic: "db.claims.events",
        cdcFormat: "debezium",
        primaryKeys: "claim_id",
      }, "Claims CDC"),
      createNode("dq-claims", "data-quality-expectations", 200, 0, {
        expectations: '[{"name":"valid_amount","constraint":"claim_amount > 0 AND claim_amount < 10000000","action":"drop"},{"name":"has_policy","constraint":"policy_id IS NOT NULL","action":"fail"},{"name":"valid_type","constraint":"claim_type IN (\'auto\',\'home\',\'life\',\'health\')","action":"warn"}]',
      }, "Claims DQ"),
      createNode("state-claims", "state-machine", 420, -40, {
        states: '["filed", "under_review", "approved", "denied", "escalated", "paid"]',
        transitions: '[{"from":"filed","to":"under_review","condition":"event_type = \'assign_adjuster\'"},{"from":"under_review","to":"approved","condition":"decision = \'approve\'"},{"from":"under_review","to":"denied","condition":"decision = \'deny\'"},{"from":"under_review","to":"escalated","condition":"claim_amount > 100000"},{"from":"approved","to":"paid","condition":"event_type = \'payment_issued\'"},{"from":"denied","to":"filed","condition":"event_type = \'appeal\'"}]',
        keyColumn: "claim_id",
        emitOn: "transition",
        terminalStates: "paid, denied",
        stateTimeout: { value: 30, unit: "days" },
      }, "Claims State Machine"),
      createNode("absence-sla", "absence-detector", 420, 120, {
        triggerEventFilter: "current_state = 'filed'",
        expectedEventFilter: "current_state = 'under_review'",
        timeoutDuration: { value: 48, unit: "hours" },
        withinDuration: { value: 72, unit: "hours" },
      }, "SLA: Review in 48h"),
      createNode("split-claims", "split-router", 660, -40, {
        routes: '[{"name":"high_value","condition":"claim_amount > 50000"},{"name":"escalated","condition":"current_state = \'escalated\'"},{"name":"denied","condition":"current_state = \'denied\'"}]',
        defaultRoute: "standard",
      }, "Route by Priority"),
      createNode("delta-claims", "delta-table-sink", 880, -80, {
        catalog: "main",
        schema: "insurance",
        table: "claims_lifecycle",
        writeMode: "append",
      }, "Claims History"),
      createNode("email-escalation", "email-sink", 880, 30, {
        smtpProvider: "sendgrid",
        to: "claims-escalation@insurer.com",
        subjectTemplate: "Escalated Claim: {{claim_id}} (${{claim_amount}})",
        bodyTemplate: "Claim {{claim_id}} escalated — amount: ${{claim_amount}}, type: {{claim_type}}",
      }, "Escalation Email"),
      createNode("delta-sla", "delta-table-sink", 660, 200, {
        catalog: "main",
        schema: "insurance",
        table: "sla_breaches",
        writeMode: "append",
      }, "SLA Breach Log"),
    ],
    edges: [
      createEdge("cdc-claims", "dq-claims"),
      createEdge("dq-claims", "state-claims"),
      createEdge("dq-claims", "absence-sla"),
      createEdge("state-claims", "split-claims"),
      createEdge("split-claims", "delta-claims"),
      createEdge("split-claims", "email-escalation"),
      createEdge("absence-sla", "delta-sla"),
    ],
  },

  {
    id: "ad-impression-attribution",
    name: "Ad Impression Attribution",
    description:
      "Multi-touch attribution: Google Pub/Sub ad impressions, deduplicate, correlate impression→click→conversion within 7 days, aggregate CTR per campaign per hour, write to Unity Catalog.",
    industry: "Media / Advertising",
    difficulty: "advanced",
    nodes: [
      createNode("pubsub-impressions", "google-pubsub", 0, 0, {
        projectId: "ad-platform-prod",
        subscriptionId: "impressions-sub",
        deserializationFormat: "json",
      }, "Ad Impressions (Pub/Sub)"),
      createNode("pubsub-clicks", "google-pubsub", 0, 150, {
        projectId: "ad-platform-prod",
        subscriptionId: "clicks-sub",
        deserializationFormat: "json",
      }, "Ad Clicks (Pub/Sub)"),
      createNode("dedup-impressions", "deduplication", 220, 0, {
        deduplicationKey: "impression_id",
        watermarkDuration: { value: 1, unit: "hours" },
      }, "Dedup Impressions"),
      createNode("temporal-attr", "temporal-correlation", 440, 60, {
        streamAFilter: "event_type = 'impression'",
        streamBFilter: "event_type = 'click'",
        correlationKey: "ad_id",
        maxTimeGap: { value: 30, unit: "minutes" },
      }, "Impression → Click"),
      createNode("seq-conversion", "sequence-detector", 660, 60, {
        steps: [
          { name: "impression", filter: "event_type = 'impression'" },
          { name: "click", filter: "event_type = 'click'" },
          { name: "conversion", filter: "event_type = 'conversion'" },
        ],
        contiguityMode: "relaxed",
        withinDuration: { value: 7, unit: "days" },
      }, "Full Conversion Path"),
      createNode("window-ctr", "window-aggregate", 440, -80, {
        windowType: "tumbling",
        windowDuration: { value: 1, unit: "hours" },
        groupByColumns: "campaign_id, ad_group_id",
        aggregations: [
          { column: "impression_id", function: "count", alias: "impressions" },
          { column: "click_id", function: "count", alias: "clicks" },
        ],
      }, "Hourly CTR Metrics"),
      createNode("uc-attribution", "unity-catalog-table-sink", 880, 60, {
        catalog: "main",
        schema: "advertising",
        table: "attribution_events",
        writeMode: "append",
      }, "Attribution Table"),
      createNode("uc-ctr", "unity-catalog-table-sink", 660, -80, {
        catalog: "main",
        schema: "advertising",
        table: "hourly_campaign_metrics",
        writeMode: "append",
      }, "Campaign Metrics"),
    ],
    edges: [
      createEdge("pubsub-impressions", "dedup-impressions"),
      createEdge("dedup-impressions", "temporal-attr"),
      createEdge("dedup-impressions", "window-ctr"),
      createEdge("pubsub-clicks", "temporal-attr"),
      createEdge("temporal-attr", "seq-conversion"),
      createEdge("seq-conversion", "uc-attribution"),
      createEdge("window-ctr", "uc-ctr"),
    ],
  },

  {
    id: "smart-building-management",
    name: "Smart Building Management",
    description:
      "PropTech IoT: monitor HVAC/lighting/occupancy sensors, detect device outages via heartbeat, HVAC state machine (idle→heating→cooling→emergency), zone-level aggregates, watermark for late sensor data.",
    industry: "Real Estate / PropTech",
    difficulty: "advanced",
    nodes: [
      createNode("mqtt-building", "mqtt", 0, 0, {
        brokerUrl: "tcp://building-iot:1883",
        topicFilter: "building/+/+/data",
        qos: "1",
        clientId: "building-mgmt-consumer",
      }, "Building Sensors"),
      createNode("watermark-bldg", "watermark", 200, 0, {
        timestampColumn: "event_time",
        delayThreshold: { value: 10, unit: "seconds" },
      }, "Watermark (10s)"),
      createNode("heartbeat-devices", "heartbeat-liveness", 200, 150, {
        entityKey: "sensor_id",
        expectedInterval: { value: 5, unit: "minutes" },
        gracePeriod: { value: 2, unit: "minutes" },
        outputMode: "status-change",
      }, "Device Health"),
      createNode("state-hvac", "state-machine", 440, -40, {
        states: '["idle", "heating", "cooling", "ventilating", "emergency_shutdown"]',
        transitions: '[{"from":"idle","to":"heating","condition":"zone_temp < setpoint - 2"},{"from":"idle","to":"cooling","condition":"zone_temp > setpoint + 2"},{"from":"heating","to":"idle","condition":"zone_temp >= setpoint"},{"from":"cooling","to":"idle","condition":"zone_temp <= setpoint"},{"from":"heating","to":"emergency_shutdown","condition":"zone_temp > 40"},{"from":"cooling","to":"emergency_shutdown","condition":"zone_temp < 5"}]',
        keyColumn: "zone_id",
        emitOn: "transition",
        terminalStates: "emergency_shutdown",
        stateTimeout: { value: 4, unit: "hours" },
      }, "HVAC State Machine"),
      createNode("window-zone", "window-aggregate", 440, 120, {
        windowType: "tumbling",
        windowDuration: { value: 5, unit: "minutes" },
        groupByColumns: "zone_id, floor",
        aggregations: [
          { column: "temperature", function: "avg", alias: "avg_temp" },
          { column: "humidity", function: "avg", alias: "avg_humidity" },
          { column: "occupancy", function: "max", alias: "peak_occupancy" },
        ],
      }, "Zone Metrics (5min)"),
      createNode("delta-building", "delta-table-sink", 700, 0, {
        catalog: "main",
        schema: "proptech",
        table: "building_events",
        writeMode: "append",
      }, "Building Events"),
      createNode("delta-zones", "delta-table-sink", 700, 120, {
        catalog: "main",
        schema: "proptech",
        table: "zone_metrics",
        writeMode: "append",
      }, "Zone Metrics Table"),
      createNode("slack-building", "slack-teams-pagerduty", 700, 240, {
        provider: "slack",
        webhookUrl: "https://hooks.slack.com/services/xxx",
        messageTemplate: "Building Alert: {{alert_type}} — Zone {{zone_id}}, Floor {{floor}}",
      }, "Facilities Alert"),
    ],
    edges: [
      createEdge("mqtt-building", "watermark-bldg"),
      createEdge("mqtt-building", "heartbeat-devices"),
      createEdge("watermark-bldg", "state-hvac"),
      createEdge("watermark-bldg", "window-zone"),
      createEdge("state-hvac", "delta-building"),
      createEdge("window-zone", "delta-zones"),
      createEdge("heartbeat-devices", "slack-building"),
    ],
  },

  {
    id: "aml-transaction-monitoring",
    name: "Anti-Money Laundering (AML)",
    description:
      "Banking compliance: monitor transactions for structuring (>5 txns under $10K in 1 day), cross-account temporal correlation, data quality on KYC fields, ML risk scoring, feature store for model retraining.",
    industry: "Banking / Compliance",
    difficulty: "advanced",
    nodes: [
      createNode("kafka-txn", "kafka-topic", 0, 0, {
        bootstrapServers: "broker:9092",
        topics: "bank_transactions",
        consumerGroup: "aml-monitor-consumer",
        startingOffset: "latest",
        schemaSource: "schema-registry",
        deserializationFormat: "avro",
      }, "Transactions Stream"),
      createNode("dq-kyc", "data-quality-expectations", 220, 0, {
        expectations: '[{"name":"valid_amount","constraint":"amount > 0","action":"drop"},{"name":"has_account","constraint":"account_id IS NOT NULL","action":"fail"},{"name":"kyc_complete","constraint":"kyc_status = \'verified\'","action":"warn"}]',
      }, "KYC Data Quality"),
      createNode("count-structuring", "count-threshold", 440, -80, {
        eventFilter: "amount < 10000 AND amount > 5000",
        thresholdCount: 5,
        windowDuration: { value: 24, unit: "hours" },
      }, "Structuring Detection"),
      createNode("temporal-cross", "temporal-correlation", 440, 40, {
        streamAFilter: "txn_type = 'outgoing'",
        streamBFilter: "txn_type = 'incoming'",
        correlationKey: "counterparty_id",
        maxTimeGap: { value: 30, unit: "minutes" },
      }, "Cross-Account Correlation"),
      createNode("velocity-txn", "velocity-detector", 440, 160, {
        eventFilter: "txn_type = 'wire_transfer'",
        rateThreshold: 3,
        rateUnit: "per_hour",
        windowDuration: { value: 1, unit: "hours" },
      }, "Wire Transfer Velocity"),
      createNode("union-aml", "union-merge", 660, 40, {}),
      createNode("ml-risk", "ml-model-endpoint", 860, -40, {
        endpointName: "aml-risk-scoring-model",
        inputColumns: "account_id, amount, txn_type, counterparty_id, country_code",
        outputColumn: "aml_risk_score",
        outputType: "DoubleType()",
        timeout: 5000,
        fallbackValue: "0.0",
      }, "AML Risk Score"),
      createNode("feature-aml", "feature-store-sink", 860, 60, {
        featureTableName: "main.compliance.account_risk_features",
        primaryKeys: "account_id",
        timestampKey: "event_time",
        description: "Real-time account risk features for AML model retraining",
        writeMode: "merge",
      }, "Risk Feature Store"),
      createNode("split-risk", "split-router", 1060, -40, {
        routes: '[{"name":"high_risk","condition":"aml_risk_score > 0.8"},{"name":"medium_risk","condition":"aml_risk_score > 0.5"}]',
        defaultRoute: "low_risk",
      }, "Risk Router"),
      createNode("delta-sar", "delta-table-sink", 1260, -80, {
        catalog: "main",
        schema: "compliance",
        table: "suspicious_activity_reports",
        writeMode: "append",
      }, "SAR Table"),
      createNode("email-compliance", "email-sink", 1260, 20, {
        smtpProvider: "sendgrid",
        to: "compliance-team@bank.com",
        subjectTemplate: "SAR Alert: Account {{account_id}} — Risk Score {{aml_risk_score}}",
        bodyTemplate: "Suspicious activity detected for account {{account_id}}. Risk score: {{aml_risk_score}}. Amount: ${{amount}}. Review required within 24 hours.",
      }, "Compliance Alert"),
    ],
    edges: [
      createEdge("kafka-txn", "dq-kyc"),
      createEdge("dq-kyc", "count-structuring"),
      createEdge("dq-kyc", "temporal-cross"),
      createEdge("dq-kyc", "velocity-txn"),
      createEdge("count-structuring", "union-aml"),
      createEdge("temporal-cross", "union-aml"),
      createEdge("velocity-txn", "union-aml"),
      createEdge("union-aml", "ml-risk"),
      createEdge("union-aml", "feature-aml"),
      createEdge("ml-risk", "split-risk"),
      createEdge("split-risk", "delta-sar"),
      createEdge("split-risk", "email-compliance"),
    ],
  },
];
