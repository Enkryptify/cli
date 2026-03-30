import { vi } from "vitest";

// Mock keytar globally -- native module unavailable in CI
vi.mock("keytar", () => ({
    setPassword: vi.fn(),
    getPassword: vi.fn(),
    deletePassword: vi.fn(),
    findPassword: vi.fn(),
    findCredentials: vi.fn(),
}));

// Spy on process.exit to prevent test runner from dying
vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
}) as never);
