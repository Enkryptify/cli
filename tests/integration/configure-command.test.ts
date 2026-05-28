import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_PROJECT_CONFIG } from "../helpers/fixtures";

vi.mock("@/lib/logger");

vi.mock("@/lib/config", () => ({
    config: {
        isAuthenticated: vi.fn(),
        createConfigure: vi.fn(),
    },
}));

vi.mock("@/api/client", () => ({
    client: {
        configure: vi.fn(),
    },
}));

vi.mock("@/lib/git", () => ({
    getGitRepoInfo: vi.fn(),
}));

vi.mock("@/ui/SelectItem", () => ({
    selectName: vi.fn(),
}));

import { client } from "@/api/client";
import { configure } from "@/cmd/configure";
import { config } from "@/lib/config";
import { getGitRepoInfo } from "@/lib/git";
import { selectName } from "@/ui/SelectItem";

describe("configure command", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, "cwd").mockReturnValue("/tmp/repo");
        vi.mocked(config.isAuthenticated).mockResolvedValue(true);
        vi.mocked(config.createConfigure).mockResolvedValue(undefined);
        vi.mocked(client.configure).mockResolvedValue(FAKE_PROJECT_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses git scope when --git is provided", async () => {
        vi.mocked(getGitRepoInfo).mockResolvedValue({
            root: "/tmp/repo",
            commonDir: "/tmp/repo/.git",
            setupKey: "git:/tmp/repo/.git",
        });

        await configure({ git: true });

        expect(selectName).not.toHaveBeenCalled();
        expect(client.configure).toHaveBeenCalledWith("/tmp/repo", { scope: "git" });
        expect(config.createConfigure).toHaveBeenCalledWith("/tmp/repo", FAKE_PROJECT_CONFIG, { scope: "git" });
    });

    it("throws when --git is used outside a git repository (before any API call)", async () => {
        vi.mocked(getGitRepoInfo).mockResolvedValue(null);

        await expect(configure({ git: true })).rejects.toThrow("No Git repository found.");
        expect(client.configure).not.toHaveBeenCalled();
        expect(config.createConfigure).not.toHaveBeenCalled();
    });

    it("asks for setup scope inside a git repo and defaults to git option", async () => {
        vi.mocked(getGitRepoInfo).mockResolvedValue({
            root: "/tmp/repo",
            commonDir: "/tmp/repo/.git",
            setupKey: "git:/tmp/repo/.git",
        });
        vi.mocked(selectName).mockResolvedValue("Git repository (recommended)");

        await configure();

        expect(selectName).toHaveBeenCalledWith(
            ["Git repository (recommended)", "This path only"],
            "Connect this setup to this path or to the Git repository?",
        );
        expect(client.configure).toHaveBeenCalledWith("/tmp/repo", { scope: "git" });
        expect(config.createConfigure).toHaveBeenCalledWith("/tmp/repo", FAKE_PROJECT_CONFIG, { scope: "git" });
    });

    it("keeps path scope outside a git repo without asking an extra question", async () => {
        vi.mocked(getGitRepoInfo).mockResolvedValue(null);

        await configure();

        expect(selectName).not.toHaveBeenCalled();
        expect(client.configure).toHaveBeenCalledWith("/tmp/repo", { scope: "path" });
        expect(config.createConfigure).toHaveBeenCalledWith("/tmp/repo", FAKE_PROJECT_CONFIG, { scope: "path" });
    });
});
