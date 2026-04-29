import { expect, expectTypeOf, test } from "vitest";
import * as z from "zod/v4";

// ---------------------------------------------------------------------------
// Object — greedy field parsing
// ---------------------------------------------------------------------------

test("greedySafeParse: object fully valid returns success:true partial:false", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const result = schema.greedySafeParse({ a: 1, b: "hello" });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(false);
  expect(result.data).toEqual({ a: 1, b: "hello" });
  expect(result.error).toBeUndefined();
});

test("greedySafeParse: object with one invalid required field omits field, collects error", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const result = schema.greedySafeParse({ a: "not-a-number", b: "hello" });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  // invalid field omitted
  expect((result.data as any).a).toBeUndefined();
  // valid field present
  expect((result.data as any).b).toBe("hello");
  // error recorded with correct path
  expect(result.error!.issues).toHaveLength(1);
  expect(result.error!.issues[0].path).toEqual(["a"]);
});

test("greedySafeParse: object with all invalid fields returns partial:true with empty output", () => {
  const schema = z.object({ a: z.number(), b: z.number() });
  const result = schema.greedySafeParse({ a: "bad", b: "bad" });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect(result.data).toEqual({});
  expect(result.error!.issues).toHaveLength(2);
  const paths = result.error!.issues.map((i) => i.path[0]);
  expect(paths).toContain("a");
  expect(paths).toContain("b");
});

test("greedySafeParse: optional field absent — no error, not in output", () => {
  const schema = z.object({ a: z.number(), b: z.string().optional() });
  const result = schema.greedySafeParse({ a: 1 });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(false);
  expect(result.data).toEqual({ a: 1 });
  expect(result.error).toBeUndefined();
});

test("greedySafeParse: optional field present but invalid — omitted, error recorded", () => {
  const schema = z.object({ a: z.number(), b: z.string().optional() });
  const result = schema.greedySafeParse({ a: 1, b: 99 });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect((result.data as any).b).toBeUndefined();
  expect(result.error!.issues).toHaveLength(1);
  expect(result.error!.issues[0].path).toEqual(["b"]);
});

test("greedySafeParse: root type mismatch is a hard failure", () => {
  const schema = z.object({ a: z.number() });
  const result = schema.greedySafeParse("not-an-object");

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].code).toBe("invalid_type");
});

// ---------------------------------------------------------------------------
// Object — default behaviour unchanged (safeParse still throws on any error)
// ---------------------------------------------------------------------------

test("safeParse (non-greedy): object with invalid field still returns success:false", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const result = schema.safeParse({ a: "bad", b: "hello" });

  expect(result.success).toBe(false);
});

// ---------------------------------------------------------------------------
// Array — greedy element stripping
// ---------------------------------------------------------------------------

test("greedySafeParse: array fully valid returns success:true partial:false", () => {
  const schema = z.array(z.number());
  const result = schema.greedySafeParse([1, 2, 3]);

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(false);
  expect(result.data).toEqual([1, 2, 3]);
});

test("greedySafeParse: array strips invalid elements, keeps valid ones", () => {
  const schema = z.array(z.number());
  const result = schema.greedySafeParse([1, "bad", 3, "also-bad", 5]);

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect(result.data).toEqual([1, 3, 5]);
  // errors carry original indices
  const paths = result.error!.issues.map((i) => i.path[0]);
  expect(paths).toContain(1);
  expect(paths).toContain(3);
});

test("greedySafeParse: array errors record original index even after stripping", () => {
  const schema = z.array(z.number());
  const result = schema.greedySafeParse([0, "x", 2]);

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  // element at original index 1 failed
  expect(result.error!.issues[0].path[0]).toBe(1);
  // output is compact
  expect(result.data).toEqual([0, 2]);
});

test("greedySafeParse: all elements invalid — partial:true, empty array", () => {
  const schema = z.array(z.number());
  const result = schema.greedySafeParse(["a", "b", "c"]);

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect(result.data).toEqual([]);
  expect(result.error!.issues).toHaveLength(3);
});

test("greedySafeParse: nonempty array — all elements invalid is a hard failure", () => {
  const schema = z.array(z.number()).nonempty();
  const result = schema.greedySafeParse(["a", "b"]);

  expect(result.success).toBe(false);
  if (result.success) return;
  // should include the too_small / element errors
  expect(result.error.issues.length).toBeGreaterThan(0);
});

test("greedySafeParse: nonempty array — some valid elements passes", () => {
  const schema = z.array(z.number()).nonempty();
  const result = schema.greedySafeParse([1, "bad", 3]);

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect(result.data).toEqual([1, 3]);
});

test("greedySafeParse: empty array with nonempty constraint is hard failure", () => {
  const schema = z.array(z.number()).nonempty();
  const result = schema.greedySafeParse([]);

  // empty input means 0 valid elements — min not met
  expect(result.success).toBe(false);
});

test("greedySafeParse: root is not an array — hard failure", () => {
  const schema = z.array(z.number());
  const result = schema.greedySafeParse("not-an-array");

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].code).toBe("invalid_type");
});

// ---------------------------------------------------------------------------
// Array — default behaviour unchanged
// ---------------------------------------------------------------------------

test("safeParse (non-greedy): array with any invalid element returns success:false", () => {
  const schema = z.array(z.number());
  const result = schema.safeParse([1, "bad", 3]);

  expect(result.success).toBe(false);
});

// ---------------------------------------------------------------------------
// Nested: object containing array
// ---------------------------------------------------------------------------

test("greedySafeParse: nested object+array — deep errors collected with full path", () => {
  const schema = z.object({
    name: z.string(),
    scores: z.array(z.number()),
  });

  const result = schema.greedySafeParse({ name: 42, scores: [10, "x", 30] });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);

  // name field failed — omitted
  expect((result.data as any).name).toBeUndefined();
  // scores array stripped
  expect((result.data as any).scores).toEqual([10, 30]);

  const paths = result.error!.issues.map((i) => i.path);
  // name error
  expect(paths.some((p) => p[0] === "name")).toBe(true);
  // scores[1] error
  expect(paths.some((p) => p[0] === "scores" && p[1] === 1)).toBe(true);
});

test("greedySafeParse: nested objects — invalid inner field omitted, outer object returned", () => {
  const schema = z.object({
    user: z.object({ id: z.number(), name: z.string() }),
  });

  const result = schema.greedySafeParse({ user: { id: "bad", name: "Alice" } });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect((result.data as any).user.name).toBe("Alice");
  expect((result.data as any).user.id).toBeUndefined();
  expect(result.error!.issues[0].path).toEqual(["user", "id"]);
});

// ---------------------------------------------------------------------------
// Standalone z.greedySafeParse function
// ---------------------------------------------------------------------------

test("z.greedySafeParse standalone function works same as method", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const method = schema.greedySafeParse({ a: "bad", b: "ok" });
  const standalone = z.greedySafeParse(schema, { a: "bad", b: "ok" });

  expect(method.success).toEqual(standalone.success);
  if (!method.success || !standalone.success) return;
  expect(method.partial).toEqual(standalone.partial);
  expect(method.data).toEqual(standalone.data);
});

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

test("greedySafeParse result types are correct", () => {
  const schema = z.object({ a: z.number() });
  const result = schema.greedySafeParse({ a: 1 });

  if (result.success && !result.partial) {
    expectTypeOf(result.data).toEqualTypeOf<{ a: number }>();
  }
});
