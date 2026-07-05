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

test("greedySafeParse: object with one invalid required field is a hard failure (required means required)", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const result = schema.greedySafeParse({ a: "not-a-number", b: "hello" });

  // A required field with nothing salvageable invalidates the whole object —
  // there is no legitimate value for a mandatory field, unlike an optional
  // field simply being dropped (see the optional-field tests below).
  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues.some((i) => i.path[0] === "a")).toBe(true);
});

test("greedySafeParse: object with all invalid required fields is a hard failure", () => {
  const schema = z.object({ a: z.number(), b: z.number() });
  const result = schema.greedySafeParse({ a: "bad", b: "bad" });

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues).toHaveLength(2);
  const paths = result.error.issues.map((i) => i.path[0]);
  expect(paths).toContain("a");
  expect(paths).toContain("b");
});

test("greedySafeParse: required field entirely missing (key absent) is a hard failure", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const result = schema.greedySafeParse({ b: "hello" });

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues.some((i) => i.path[0] === "a")).toBe(true);
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

test("greedySafeParse: a hard failure still exposes whatever partial value was assembled as `data`", () => {
  // Sibling fields unrelated to the one that failed are still useful to a caller
  // that wants to salvage them (e.g. wiring up error-tracking listeners from a
  // still-valid field before re-throwing) even though the object overall failed.
  const schema = z.object({ a: z.number(), sibling: z.string() });
  const result = schema.greedySafeParse({ a: "bad", sibling: "still here" });

  expect(result.success).toBe(false);
  if (result.success) return;
  expect((result.data as any).sibling).toBe("still here");
  expect((result.data as any).a).toBeUndefined();
});

test("greedySafeParse: root type mismatch's `data` is just the original raw input", () => {
  const schema = z.object({ a: z.number() });
  const result = schema.greedySafeParse("not-an-object");

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.data).toBe("not-an-object");
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

test("greedySafeParse: nested object+array — a required scalar field failing is a hard failure", () => {
  const schema = z.object({
    name: z.string(),
    scores: z.array(z.number()),
  });

  const result = schema.greedySafeParse({ name: 42, scores: [10, "x", 30] });

  // `name` is required and unsalvageable (42 isn't a string) — hard failure,
  // even though `scores` itself would otherwise happily strip down to [10, 30].
  expect(result.success).toBe(false);
  if (result.success) return;
  const paths = result.error.issues.map((i) => i.path);
  expect(paths.some((p) => p[0] === "name")).toBe(true);
});

test("greedySafeParse: array field elements stripping still works when every other required field is valid", () => {
  const schema = z.object({
    name: z.string(),
    scores: z.array(z.number()),
  });

  const result = schema.greedySafeParse({ name: "ok", scores: [10, "x", 30] });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect((result.data as any).name).toBe("ok");
  expect((result.data as any).scores).toEqual([10, 30]);
  const paths = result.error!.issues.map((i) => i.path);
  expect(paths.some((p) => p[0] === "scores" && p[1] === 1)).toBe(true);
});

test("greedySafeParse: a required field's own required sub-field failing propagates the hard failure up the tree", () => {
  // user is required; user.id is required within user's own schema. id fails
  // unsalvageably -> user's own object result becomes greedyFailed -> since
  // `user` is itself required on the outer schema, that propagates too.
  const schema = z.object({
    user: z.object({ id: z.number(), name: z.string() }),
  });

  const result = schema.greedySafeParse({ user: { id: "bad", name: "Alice" } });

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].path).toEqual(["user", "id"]);
});

test("greedySafeParse: propagation stops at the first optional ancestor", () => {
  // Same inner failure as above, but `user` itself is optional on the outer
  // schema — the inner object still hard-fails on its own required `id`, but
  // the outer object simply drops the whole (unsalvageable) `user` field
  // instead of failing itself, exactly like any other optional-field failure.
  const schema = z.object({
    other: z.string(),
    user: z.optional(z.object({ id: z.number(), name: z.string() })),
  });

  const result = schema.greedySafeParse({ other: "kept", user: { id: "bad", name: "Alice" } });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect((result.data as any).other).toBe("kept");
  expect((result.data as any).user).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Union / discriminated union — total mismatch is a hard failure
// ---------------------------------------------------------------------------

test("greedySafeParse: union with no matching branch is a hard failure", () => {
  const schema = z.union([z.string(), z.number()]);
  const result = schema.greedySafeParse(true);

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].code).toBe("invalid_union");
});

test("greedySafeParse: discriminated union with unrecognized discriminator is a hard failure", () => {
  const schema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("a"), a: z.number() }),
    z.object({ type: z.literal("b"), b: z.string() }),
  ]);
  const result = schema.greedySafeParse({ type: "c", a: 1 });

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].code).toBe("invalid_union");
});

test("greedySafeParse: discriminated union with missing discriminator is a hard failure", () => {
  const schema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("a"), a: z.number() }),
    z.object({ type: z.literal("b"), b: z.string() }),
  ]);
  const result = schema.greedySafeParse({ a: 1 });

  expect(result.success).toBe(false);
});

test("greedySafeParse: discriminated union root type mismatch is a hard failure", () => {
  const schema = z.discriminatedUnion("type", [z.object({ type: z.literal("a"), a: z.number() })]);
  const result = schema.greedySafeParse("not-an-object");

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].code).toBe("invalid_type");
});

test("greedySafeParse: discriminated union with matching discriminator still salvages an invalid OPTIONAL sibling field", () => {
  const schema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("a"), a: z.optional(z.number()), b: z.string() }),
  ]);
  const result = schema.greedySafeParse({ type: "a", a: "bad", b: "hello" });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect((result.data as any).b).toBe("hello");
  expect((result.data as any).a).toBeUndefined();
});

test("greedySafeParse: discriminated union with matching discriminator still hard-fails on an invalid REQUIRED sibling field", () => {
  // Same shape as above, but `a` is required — required means required even
  // once the correct union branch has already been identified.
  const schema = z.discriminatedUnion("type", [z.object({ type: z.literal("a"), a: z.number(), b: z.string() })]);
  const result = schema.greedySafeParse({ type: "a", a: "bad", b: "hello" });

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues.some((i) => i.path[0] === "a")).toBe(true);
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
