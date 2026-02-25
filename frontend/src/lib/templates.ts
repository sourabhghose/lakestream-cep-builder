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
      "Monitor a fleet of trucks in real time: join geo-location and speed sensor streams, detect speeding violations (avg speed > 80 mph over 3-min windows), trigger alerts, apply ML predictions, and sink to a lakehouse for BI.",
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
      // Violations → ML prediction → lakehouse
      createEdge("filter-violations", "ml-predict"),
      createEdge("ml-predict", "lakehouse-predictions"),
      // Violations → lakehouse for BI
      createEdge("filter-violations", "lakehouse-violations"),
      // Violations → windowed avg speed → speeding filter → alerts
      createEdge("filter-violations", "avg-speed"),
      createEdge("avg-speed", "filter-speeding"),
      createEdge("filter-speeding", "email-alert"),
      createEdge("filter-speeding", "slack-alert"),
    ],
  },
];
