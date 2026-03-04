import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  setRemotesDir,
  resetRemotesDir,
  validateHost,
  validatePort,
  validateUsername,
} from "./remote-profile-manager.js";

const TEST_DIR = join(tmpdir(), "companion-remote-test-" + process.pid);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  setRemotesDir(TEST_DIR);
});

afterEach(() => {
  resetRemotesDir();
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch { /* ok */ }
});

describe("validation helpers", () => {
  it("validates hosts correctly", () => {
    expect(validateHost("example.com")).toBe(true);
    expect(validateHost("my-server.local")).toBe(true);
    expect(validateHost("192.168.1.1")).toBe(true);
    expect(validateHost("host_name")).toBe(true);
    expect(validateHost("")).toBe(false);
    expect(validateHost("host name")).toBe(false);
    expect(validateHost("host;rm -rf")).toBe(false);
    expect(validateHost("host`cmd`")).toBe(false);
  });

  it("validates ports correctly", () => {
    expect(validatePort(22)).toBe(true);
    expect(validatePort(1)).toBe(true);
    expect(validatePort(65535)).toBe(true);
    expect(validatePort(0)).toBe(false);
    expect(validatePort(65536)).toBe(false);
    expect(validatePort(-1)).toBe(false);
    expect(validatePort(1.5)).toBe(false);
  });

  it("validates usernames correctly", () => {
    expect(validateUsername("root")).toBe(true);
    expect(validateUsername("user@host")).toBe(true);
    expect(validateUsername("my-user")).toBe(true);
    expect(validateUsername("user.name")).toBe(true);
    expect(validateUsername("")).toBe(false);
    expect(validateUsername("user name")).toBe(false);
    expect(validateUsername("user;cmd")).toBe(false);
  });
});

describe("CRUD operations", () => {
  it("lists profiles from an empty directory", () => {
    const profiles = listProfiles();
    expect(profiles).toEqual([]);
  });

  it("creates a profile with default port", () => {
    const profile = createProfile({
      name: "My Server",
      host: "example.com",
      username: "root",
      authMethod: "key",
      keyPath: "/home/user/.ssh/id_rsa",
    });

    expect(profile.slug).toBe("my-server");
    expect(profile.name).toBe("My Server");
    expect(profile.host).toBe("example.com");
    expect(profile.port).toBe(22);
    expect(profile.username).toBe("root");
    expect(profile.authMethod).toBe("key");
    expect(profile.keyPath).toBe("/home/user/.ssh/id_rsa");
    expect(profile.createdAt).toBeGreaterThan(0);
    expect(profile.updatedAt).toBe(profile.createdAt);
  });

  it("creates a profile with custom port", () => {
    const profile = createProfile({
      name: "Custom Port",
      host: "192.168.1.100",
      port: 2222,
      username: "admin",
      authMethod: "password",
    });

    expect(profile.port).toBe(2222);
    expect(profile.authMethod).toBe("password");
    // keyPath should be undefined for password auth
    expect(profile.keyPath).toBeUndefined();
  });

  it("rejects duplicate names", () => {
    createProfile({
      name: "Duplicate",
      host: "a.com",
      username: "root",
      authMethod: "key",
    });

    expect(() =>
      createProfile({
        name: "Duplicate",
        host: "b.com",
        username: "admin",
        authMethod: "key",
      }),
    ).toThrow(/already exists/);
  });

  it("rejects empty name", () => {
    expect(() =>
      createProfile({
        name: "",
        host: "a.com",
        username: "root",
        authMethod: "key",
      }),
    ).toThrow(/name is required/);
  });

  it("rejects invalid host", () => {
    expect(() =>
      createProfile({
        name: "Bad Host",
        host: "host;rm -rf /",
        username: "root",
        authMethod: "key",
      }),
    ).toThrow(/Invalid host/);
  });

  it("rejects invalid username", () => {
    expect(() =>
      createProfile({
        name: "Bad User",
        host: "valid.host",
        username: "user$(cmd)",
        authMethod: "key",
      }),
    ).toThrow(/Invalid username/);
  });

  it("rejects invalid port", () => {
    expect(() =>
      createProfile({
        name: "Bad Port",
        host: "valid.host",
        port: 99999,
        username: "root",
        authMethod: "key",
      }),
    ).toThrow(/Invalid port/);
  });

  it("gets a profile by slug", () => {
    createProfile({
      name: "Get Test",
      host: "test.com",
      username: "user",
      authMethod: "key",
    });

    const profile = getProfile("get-test");
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe("Get Test");
  });

  it("returns null for missing profile", () => {
    expect(getProfile("nonexistent")).toBeNull();
  });

  it("lists profiles sorted by name", () => {
    createProfile({ name: "Zeta", host: "z.com", username: "u", authMethod: "key" });
    createProfile({ name: "Alpha", host: "a.com", username: "u", authMethod: "key" });
    createProfile({ name: "Mid", host: "m.com", username: "u", authMethod: "key" });

    const profiles = listProfiles();
    expect(profiles.map((p) => p.name)).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("updates a profile", () => {
    createProfile({
      name: "Original",
      host: "old.com",
      username: "root",
      authMethod: "key",
    });

    const updated = updateProfile("original", {
      host: "updated.com",
      port: 2222,
    });

    expect(updated).not.toBeNull();
    expect(updated!.host).toBe("updated.com");
    expect(updated!.port).toBe(2222);
    expect(updated!.name).toBe("Original");
  });

  it("renames a profile (changes slug)", () => {
    createProfile({
      name: "Old Name",
      host: "host.com",
      username: "root",
      authMethod: "key",
    });

    const updated = updateProfile("old-name", { name: "Brand Name" });
    expect(updated!.slug).toBe("brand-name");
    expect(getProfile("old-name")).toBeNull();
    expect(getProfile("brand-name")).not.toBeNull();
  });

  it("returns null when updating nonexistent profile", () => {
    expect(updateProfile("nope", { host: "x.com" })).toBeNull();
  });

  it("rejects invalid fields on update", () => {
    createProfile({
      name: "Valid",
      host: "valid.com",
      username: "root",
      authMethod: "key",
    });

    expect(() => updateProfile("valid", { host: "bad host" })).toThrow(/Invalid host/);
    expect(() => updateProfile("valid", { port: 0 })).toThrow(/Invalid port/);
    expect(() => updateProfile("valid", { username: "bad user" })).toThrow(/Invalid username/);
  });

  it("deletes a profile", () => {
    createProfile({
      name: "To Delete",
      host: "del.com",
      username: "root",
      authMethod: "key",
    });

    expect(deleteProfile("to-delete")).toBe(true);
    expect(getProfile("to-delete")).toBeNull();
  });

  it("returns false when deleting nonexistent profile", () => {
    expect(deleteProfile("nope")).toBe(false);
  });

  it("clears keyPath when switching from key to password auth", () => {
    createProfile({
      name: "Switch Auth",
      host: "host.com",
      username: "user",
      authMethod: "key",
      keyPath: "/path/to/key",
    });

    const updated = updateProfile("switch-auth", { authMethod: "password" });
    expect(updated!.authMethod).toBe("password");
    expect(updated!.keyPath).toBeUndefined();
  });
});
