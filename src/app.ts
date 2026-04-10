import Fastify from "fastify";
import proxy from "@fastify/http-proxy";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = Fastify({
  logger: true,
});

app.register(cors, {
  origin: "*", // Cambiar a dominios específicos en producción
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const USERS_SERVICE_URL =
  process.env.USERS_SERVICE_URL || "http://localhost:3001";
const GROUPS_SERVICE_URL =
  process.env.GROUPS_SERVICE_URL || "http://localhost:3002";
const TICKETS_SERVICE_URL =
  process.env.TICKETS_SERVICE_URL || "http://localhost:3003";

// --- A. Microservicio de Usuarios ---
app.register(proxy, {
  upstream: USERS_SERVICE_URL,
  prefix: "/api/auth",
  rewritePrefix: "/api/auth",
});

app.register(proxy, {
  upstream: USERS_SERVICE_URL,
  prefix: "/api/users",
  rewritePrefix: "/api/users",
});

app.register(proxy, {
  upstream: USERS_SERVICE_URL,
  prefix: "/api/admin",
  rewritePrefix: "/api/admin",
});

// --- B. Microservicio de Grupos ---
app.register(proxy, {
  upstream: GROUPS_SERVICE_URL,
  prefix: "/api/groups",
  rewritePrefix: "/api/groups",
});

// --- C. Microservicio de Tickets ---
app.register(proxy, {
  upstream: TICKETS_SERVICE_URL,
  prefix: "/api/tickets",
  rewritePrefix: "/api/tickets",
});

app.addHook("onResponse", async (request, reply) => {
  if (request.method === "OPTIONS") return;

  const endpoint = request.routeOptions?.url || request.url;
  const tiempoMs = reply.elapsedTime;
  const statusCode = reply.statusCode;

  try {
    await supabase.from("system_logs").insert({
      endpoint: endpoint,
      metodo: request.method,
      ip: request.ip,
      status_http: statusCode,
      tiempo_ms: tiempoMs,
    });

    const { data: metricaActual } = await supabase
      .from("metrics")
      .select("*")
      .eq("endpoint", endpoint)
      .single();

    if (metricaActual) {
      const nuevoTotal = metricaActual.total_requests + 1;
      const nuevoPromedio =
        (metricaActual.tiempo_respuesta_promedio *
          metricaActual.total_requests +
          tiempoMs) /
        nuevoTotal;

      await supabase
        .from("metrics")
        .update({
          total_requests: nuevoTotal,
          tiempo_respuesta_promedio: nuevoPromedio,
        })
        .eq("endpoint", endpoint);
    } else {
      await supabase.from("metrics").insert({
        endpoint: endpoint,
        total_requests: 1,
        tiempo_respuesta_promedio: tiempoMs,
      });
    }
  } catch (error) {
    request.log.error(error as Error, "Error guardando logs/métricas en Supabase:");
  }
});

app.addHook("onError", async (request, reply, error) => {
  await supabase.from("system_logs").insert({
    endpoint: request.routeOptions?.url || request.url,
    metodo: request.method,
    ip: request.ip,
    status_http: reply.statusCode || 500,
    error_stack: error.stack,
    tiempo_ms: reply.elapsedTime,
  });
});

// Ruta de Healthcheck
app.get("/health", async () => {
  return {
    status: "ok",
    gateway: "API Gateway is running",
    services: {
      users: USERS_SERVICE_URL,
      groups: GROUPS_SERVICE_URL,
      tickets: TICKETS_SERVICE_URL,
    },
  };
});

// Manejo de rutas no encontradas
app.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    statusCode: 404,
    intOpCode: 1,
    data: [
      {
        message: `El recurso solicitado no existe en el API Gateway.`,
        path: request.url,
        method: request.method,
      },
    ],
  });
});

// Iniciar el servidor
const start = async () => {
  try {
    const PORT = parseInt(process.env.PORT || "3000", 10);
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`API Gateway orquestando en http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
