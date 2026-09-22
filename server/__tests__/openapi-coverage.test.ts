/**
 * Holds docs/api/openapi.json to the routes the Express app actually registers.
 *
 * Walks the live router rather than grepping source, so a route added in any
 * style or module shows up here. Every /api route must be documented, nothing
 * may be documented that does not exist, and an operation marked as needing a
 * bearer token must be exactly one that runs requireAuth.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The rig installs every module mock, so it must be imported before server/app.ts.
import "./helpers/apiContractRig";
import { app, ready } from "../app";

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name: string }>;
  };
}

interface OpenApiOperation {
  security?: unknown[];
}

const spec = JSON.parse(
  readFileSync(resolve(__dirname, "../../docs/api/openapi.json"), "utf8"),
) as { openapi: string; paths: Record<string, Record<string, OpenApiOperation>> };

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/** "METHOD /path" -> whether the handler chain includes requireAuth. */
function registeredRoutes(): Map<string, boolean> {
  const stack = (app as unknown as { _router: { stack: RouteLayer[] } })._router.stack;
  const routes = new Map<string, boolean>();
  for (const layer of stack) {
    if (!layer.route || !layer.route.path.startsWith("/api/")) continue;
    const needsAuth = layer.route.stack.some((l) => l.name === "requireAuth");
    for (const method of Object.keys(layer.route.methods)) {
      routes.set(`${method.toUpperCase()} ${layer.route.path}`, needsAuth);
    }
  }
  return routes;
}

/** Same shape from the spec, with {param} turned back into Express's :param. */
function documentedRoutes(): Map<string, boolean> {
  const routes = new Map<string, boolean>();
  for (const [path, item] of Object.entries(spec.paths)) {
    const expressPath = path.replace(/\{(\w+)\}/g, ":$1");
    for (const [method, op] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method)) continue;
      routes.set(`${method.toUpperCase()} ${expressPath}`, (op.security?.length ?? 0) > 0);
    }
  }
  return routes;
}

beforeAll(async () => {
  await ready;
});

describe("docs/api/openapi.json", () => {
  it("is an OpenAPI 3 document", () => {
    expect(spec.openapi).toMatch(/^3\./);
  });

  it("documents every registered /api route and nothing else", () => {
    const registered = [...registeredRoutes().keys()].sort();
    const documented = [...documentedRoutes().keys()].sort();
    // A sanity floor so an empty router cannot pass by matching an empty spec.
    expect(registered.length).toBeGreaterThan(30);
    expect(documented).toEqual(registered);
  });

  it("marks exactly the requireAuth routes as needing a bearer token", () => {
    const registered = registeredRoutes();
    const documented = documentedRoutes();
    const mismatched = [...registered].filter(([route, auth]) => documented.get(route) !== auth);
    expect(mismatched).toEqual([]);
  });
});
