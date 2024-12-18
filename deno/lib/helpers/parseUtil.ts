import { getErrorMap } from "../errors.ts";
import defaultErrorMap from "../locales/en.ts";
import type { IssueData, ZodErrorMap, ZodIssue } from "../ZodError.ts";
import type { ZodParsedType } from "./util.ts";

export const makeIssue = (params: {
  data: any;
  path: (string | number)[];
  errorMaps: ZodErrorMap[];
  issueData: IssueData;
}): ZodIssue => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...(issueData.path || [])];
  const fullIssue = {
    ...issueData,
    path: fullPath,
  };

  if (issueData.message !== undefined) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message,
    };
  }

  let errorMessage = "";
  const maps = errorMaps
    .filter((m) => !!m)
    .slice()
    .reverse() as ZodErrorMap[];
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }

  return {
    ...issueData,
    path: fullPath,
    message: errorMessage,
  };
};

export type ParseParams = {
  path: (string | number)[];
  errorMap: ZodErrorMap;
  async: boolean;
  strict: boolean;
};

export type ParsePathComponent = string | number;
export type ParsePath = ParsePathComponent[];
export const EMPTY_PATH: ParsePath = [];

export interface ParseContext {
  readonly common: {
    readonly issues: ZodIssue[];
    readonly contextualErrorMap?: ZodErrorMap;
    readonly async: boolean;
    readonly strict: boolean;
  };
  readonly path: ParsePath;
  readonly schemaErrorMap?: ZodErrorMap;
  readonly parent: ParseContext | null;
  readonly data: any;
  readonly parsedType: ZodParsedType;
}

export type ParseInput = {
  data: any;
  path: (string | number)[];
  parent: ParseContext;
};

export function addIssueToContext(
  ctx: ParseContext,
  issueData: IssueData
): void {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData: issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap, // contextual error map is first priority
      ctx.schemaErrorMap, // then schema-bound map if available
      overrideMap, // then global override map
      overrideMap === defaultErrorMap ? undefined : defaultErrorMap, // then global default map
    ].filter((x) => !!x) as ZodErrorMap[],
  });
  ctx.common.issues.push(issue);
}

export const mergeArray = (
  status: ParseStatus,
  results: SyncParseReturnType<any>[],
  stripInvalidFrom?: number,
  minLength?: number
): SyncParseReturnType => {
  const arrayValue: any[] = [];
  const strip = typeof stripInvalidFrom === "number";
  let stripped = false;
  for (let i = 0; i < results.length; i++) {
    const s = results[i];
    if (isAborted(s)) {
      if (!strip || i < stripInvalidFrom) {
        return INVALID;
      }

      status.dirty();
      stripped = true;
      continue;
    }
    if (isDirty(s)) {
      status.dirty();
    }
    arrayValue.push(s.value);
  }

  if (stripped && minLength && arrayValue.length < minLength) {
    return INVALID;
  }

  return { status: status.value, value: arrayValue };
};

export const mergeObjectAsync = async (
  status: ParseStatus,
  pairs: { key: ParseReturnType<any>; value: ParseReturnType<any> }[]
): Promise<SyncParseReturnType<any>> => {
  const syncPairs: ObjectPair[] = [];
  for (const pair of pairs) {
    const key = await pair.key;
    const value = await pair.value;
    syncPairs.push({
      key,
      value,
    });
  }
  return mergeObjectSync(status, syncPairs);
};

export const mergeObjectSync = (
  status: ParseStatus,
  pairs: {
    key: SyncParseReturnType<any>;
    value: SyncParseReturnType<any>;
    alwaysSet?: boolean;
  }[]
): SyncParseReturnType => {
  const finalObject: any = {};
  for (const pair of pairs) {
    const { key, value } = pair;
    if (key.status === "aborted") return INVALID;
    if (value.status === "aborted") return INVALID;
    if (key.status === "dirty") status.dirty();
    if (value.status === "dirty") status.dirty();

    if (
      key.value !== "__proto__" &&
      (typeof value.value !== "undefined" || pair.alwaysSet)
    ) {
      finalObject[key.value] = value.value;
    }
  }

  return { status: status.value, value: finalObject };
};

export type ObjectPair = {
  key: SyncParseReturnType<any>;
  value: SyncParseReturnType<any>;
};
export class ParseStatus {
  value: "aborted" | "dirty" | "valid" = "valid";
  dirty() {
    if (this.value === "valid") this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted") this.value = "aborted";
  }
}

export interface ParseResult {
  status: "aborted" | "dirty" | "valid";
  data: any;
}

export type INVALID = { status: "aborted" };
export const INVALID: INVALID = Object.freeze({
  status: "aborted",
});

export type DIRTY<T> = { status: "dirty"; value: T };
export const DIRTY = <T>(value: T): DIRTY<T> => ({ status: "dirty", value });

export type OK<T> = { status: "valid"; value: T };
export const OK = <T>(value: T): OK<T> => ({ status: "valid", value });

export type SyncParseReturnType<T = any> = OK<T> | DIRTY<T> | INVALID;
export type AsyncParseReturnType<T> = Promise<SyncParseReturnType<T>>;
export type ParseReturnType<T> =
  | SyncParseReturnType<T>
  | AsyncParseReturnType<T>;

export const isAborted = (x: ParseReturnType<any>): x is INVALID =>
  (x as any).status === "aborted";
export const isDirty = <T>(x: ParseReturnType<T>): x is OK<T> | DIRTY<T> =>
  (x as any).status === "dirty";
export const isValid = <T>(x: ParseReturnType<T>): x is OK<T> =>
  (x as any).status === "valid";
export const isAsync = <T>(
  x: ParseReturnType<T>
): x is AsyncParseReturnType<T> =>
  typeof Promise !== "undefined" && x instanceof Promise;
