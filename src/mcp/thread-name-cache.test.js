import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ThreadNameCache } from "./thread-name-cache.js";

/** Create a mock API that returns predictable group/friend data */
function createMockApi(groups = {}, friends = []) {
    return {
        getAllGroups: async () => ({
            gridVerMap: Object.fromEntries(Object.keys(groups).map((id) => [id, 1])),
        }),
        getGroupInfo: async (ids) => ({
            gridInfoMap: Object.fromEntries(ids.filter((id) => groups[id]).map((id) => [id, groups[id]])),
        }),
        getAllFriends: async () => friends,
    };
}

describe("ThreadNameCache", () => {
    let cache;

    beforeEach(() => {
        cache = new ThreadNameCache();
    });

    it("starts empty and not ready", () => {
        assert.equal(cache.ready, false);
        assert.equal(cache.size, 0);
        assert.equal(cache.get("any"), null);
        assert.equal(cache.getName("any"), null);
    });

    it("loads groups and friends on init", async () => {
        const api = createMockApi(
            {
                g1: { name: "Nhóm Chờ Báo Giá", totalMember: 20 },
                g2: { name: "Soạn hàng Q. Vũ", totalMember: 15 },
            },
            [
                { userId: "u1", displayName: "Viet Anh", zaloName: "VA" },
                { userId: "u2", zaloName: "Bob" },
            ],
        );

        await cache.init(api);

        assert.equal(cache.ready, true);
        assert.equal(cache.size, 4);
        assert.deepEqual(cache.get("g1"), { name: "Nhóm Chờ Báo Giá", type: "group", memberCount: 20 });
        assert.equal(cache.getName("g2"), "Soạn hàng Q. Vũ");
        assert.deepEqual(cache.get("u1"), { name: "Viet Anh", type: "dm" });
        assert.equal(cache.getName("u2"), "Bob");
    });

    it("handles API failures gracefully", async () => {
        const api = {
            getAllGroups: async () => {
                throw new Error("network error");
            },
            getAllFriends: async () => {
                throw new Error("network error");
            },
        };

        await cache.init(api);

        assert.equal(cache.ready, true);
        assert.equal(cache.size, 0);
    });

    describe("search", () => {
        beforeEach(async () => {
            const api = createMockApi(
                {
                    g1: { name: "Nhóm Chờ Báo Giá", totalMember: 20 },
                    g2: { name: "Soạn hàng Q. Vũ - QV", totalMember: 15 },
                    g3: { name: "Soạn hàng kho 2", totalMember: 8 },
                    g4: { name: "Admin Team", totalMember: 5 },
                },
                [{ userId: "u1", displayName: "Soạn Văn", zaloName: "SV" }],
            );
            await cache.init(api);
        });

        it("finds groups by Vietnamese name (accent-insensitive)", () => {
            const results = cache.search("soan hang");
            assert.equal(results.length, 2);
            assert.equal(results[0].name, "Soạn hàng kho 2");
            assert.equal(results[1].name, "Soạn hàng Q. Vũ - QV");
        });

        it("finds with exact Vietnamese diacritics", () => {
            const results = cache.search("Soạn hàng");
            assert.equal(results.length, 2);
            assert.ok(results.every((r) => r.type === "group"));
        });

        it("filters by type", () => {
            const groups = cache.search("Soạn", "group");
            assert.equal(groups.length, 2);
            assert.ok(groups.every((r) => r.type === "group"));

            const dms = cache.search("Soạn", "dm");
            assert.equal(dms.length, 1);
            assert.equal(dms[0].name, "Soạn Văn");
        });

        it("respects limit parameter", () => {
            const results = cache.search("Soạn", "all", 1);
            assert.equal(results.length, 1);
        });

        it("returns empty for no match", () => {
            const results = cache.search("xyz_nonexistent");
            assert.equal(results.length, 0);
        });

        it("prioritizes prefix matches", () => {
            const results = cache.search("Admin");
            assert.equal(results[0].name, "Admin Team");
        });
    });

    describe("set (update)", () => {
        it("updates existing entry", async () => {
            const api = createMockApi({ g1: { name: "Old Name", totalMember: 5 } }, []);
            await cache.init(api);

            cache.set("g1", { name: "New Name" });
            assert.equal(cache.getName("g1"), "New Name");
            assert.equal(cache.get("g1").type, "group");
            assert.equal(cache.get("g1").memberCount, 5);
        });

        it("adds new entry", () => {
            cache.set("new1", { name: "New Group", type: "group", memberCount: 3 });
            assert.deepEqual(cache.get("new1"), { name: "New Group", type: "group", memberCount: 3 });
        });
    });

    // 1.12.0: the cache is built once at start-up, so a group joined later had no name until a restart.
    describe("ensureGroupName", () => {
        it("looks an unknown group up once and caches its name", async () => {
            let calls = 0;
            const api = {
                getGroupInfo: async (id) => {
                    calls++;
                    return { gridInfoMap: { [id]: { name: "Nhóm 4 Vĩnh Cửu", totalMember: 9 } } };
                },
            };
            assert.equal(cache.needsName("g9"), true);
            const [a, b] = await Promise.all([cache.ensureGroupName(api, "g9"), cache.ensureGroupName(api, "g9")]);
            assert.equal(a, "Nhóm 4 Vĩnh Cửu");
            assert.equal(b, "Nhóm 4 Vĩnh Cửu");
            assert.equal(calls, 1, "a burst of messages asks Zalo once");
            assert.deepEqual(cache.get("g9"), { name: "Nhóm 4 Vĩnh Cửu", type: "group", memberCount: 9 });
            assert.equal(cache.needsName("g9"), false);
            assert.equal(await cache.ensureGroupName(api, "g9"), "Nhóm 4 Vĩnh Cửu");
            assert.equal(calls, 1, "a known group is not asked again");
        });

        it("treats the '?' placeholder as unknown", async () => {
            cache.set("g8", { type: "group" });
            assert.equal(cache.getName("g8"), "?");
            assert.equal(cache.needsName("g8"), true);
            const api = { getGroupInfo: async () => ({ gridInfoMap: { g8: { name: "Kho" } } }) };
            assert.equal(await cache.ensureGroupName(api, "g8"), "Kho");
        });

        it("never rejects, and backs off after a failure", async () => {
            let calls = 0;
            let t = 1000;
            const api = {
                getGroupInfo: async () => {
                    calls++;
                    throw new Error("rate limited");
                },
            };
            const opts = { retryMs: 60000, now: () => t };
            assert.equal(await cache.ensureGroupName(api, "g7", opts), null);
            assert.equal(await cache.ensureGroupName(api, "g7", opts), null);
            assert.equal(calls, 1, "not asked again inside the back-off");
            t += 60001;
            assert.equal(await cache.ensureGroupName(api, "g7", opts), null);
            assert.equal(calls, 2, "asked again once the back-off is over");
        });

        it("gives up after the timeout", async () => {
            const api = { getGroupInfo: () => new Promise(() => {}) };
            assert.equal(await cache.ensureGroupName(api, "g6", { timeoutMs: 20 }), null);
            assert.equal(cache.needsName("g6"), true);
        });

        it("a reply without a name is a failure, not an empty name", async () => {
            const api = { getGroupInfo: async () => ({ gridInfoMap: {} }) };
            assert.equal(await cache.ensureGroupName(api, "g5"), null);
            assert.equal(cache.get("g5"), null);
        });
    });

    describe("noteGroupName", () => {
        it("stores a name from a live event and ignores an empty one", () => {
            cache.noteGroupName("g4", "Tên mới");
            assert.equal(cache.getName("g4"), "Tên mới");
            cache.noteGroupName("g4", "");
            assert.equal(cache.getName("g4"), "Tên mới");
            cache.noteGroupName("", "x");
            assert.equal(cache.size, 1);
        });
    });
});
