import Fastify from "fastify";
import proxy from "@fastify/http-proxy";
import cors from "@fastify/cors";
import dotenv from "dotenv";

dotenv.config();

const app = Fastify({
  logger: true,
});

app.register(cors, {
  origin: "*", //Cambiar a dominios específicos en producción
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

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
