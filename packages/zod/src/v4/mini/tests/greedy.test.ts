import { expect, expectTypeOf, test } from "vitest";
import * as z from "zod/mini";

// Core greedy-parse behavior (partial success, error collection, hard
// failures) is exhaustively covered in classic/tests/greedy.test.ts against
// the shared core implementation. These tests only verify the zod/mini
// wiring: instance methods, standalone functions, and the async variant.

test("greedySafeParse: object with one invalid REQUIRED field is a hard failure", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const result = schema.greedySafeParse({ a: "not-a-number", b: "hello" });

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].path).toEqual(["a"]);
});

test("greedySafeParse: object with one invalid OPTIONAL field omits it, collects error", () => {
  const schema = z.object({ a: z.optional(z.number()), b: z.string() });
  const result = schema.greedySafeParse({ a: "not-a-number", b: "hello" });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.partial).toBe(true);
  expect((result.data as any).a).toBeUndefined();
  expect((result.data as any).b).toBe("hello");
  expect(result.error!.issues).toHaveLength(1);
  expect(result.error!.issues[0].path).toEqual(["a"]);
});

test("greedySafeParseAsync: same hard-failure behavior as sync variant for a required field", async () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const result = await schema.greedySafeParseAsync({ a: "not-a-number", b: "hello" });

  expect(result.success).toBe(false);
});

test("z.greedySafeParse / z.greedySafeParseAsync standalone functions match instance methods", async () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const input = { a: "bad", b: "ok" };

  const method = schema.greedySafeParse(input);
  const standalone = z.greedySafeParse(schema, input);
  expect(method).toEqual(standalone);

  const methodAsync = await schema.greedySafeParseAsync(input);
  const standaloneAsync = await z.greedySafeParseAsync(schema, input);
  expect(methodAsync).toEqual(standaloneAsync);
});

test("greedySafeParse result types are correct", () => {
  const schema = z.object({ a: z.number() });
  const result = schema.greedySafeParse({ a: 1 });

  if (result.success && !result.partial) {
    expectTypeOf(result.data).toEqualTypeOf<{ a: number }>();
  }
});
