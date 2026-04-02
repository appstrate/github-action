// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Appstrate

import { describe, it, expect } from "bun:test";
import { parseAgent } from "../../src/inputs.js";

describe("parseAgent", () => {
  it("parses valid @scope/name", () => {
    expect(parseAgent("@myorg/anti-leak")).toEqual({ scope: "@myorg", name: "anti-leak" });
  });

  it("parses single-char scope and name", () => {
    expect(parseAgent("@a/b")).toEqual({ scope: "@a", name: "b" });
  });

  it("rejects missing @", () => {
    expect(() => parseAgent("myorg/anti-leak")).toThrow("Invalid agent format");
  });

  it("rejects missing scope", () => {
    expect(() => parseAgent("anti-leak")).toThrow("Invalid agent format");
  });

  it("rejects uppercase", () => {
    expect(() => parseAgent("@MyOrg/Anti-Leak")).toThrow("Invalid agent format");
  });

  it("rejects empty name", () => {
    expect(() => parseAgent("@myorg/")).toThrow("Invalid agent format");
  });

  it("rejects spaces", () => {
    expect(() => parseAgent("@my org/name")).toThrow("Invalid agent format");
  });
});
