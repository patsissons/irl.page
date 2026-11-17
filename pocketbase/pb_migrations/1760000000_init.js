/// <reference path="../pb_data/types.d.ts" />

// The whole IRL Page schema. Every rule is null (superuser only): the Worker
// is the only client and signs in as a superuser, so nothing here is
// reachable from a browser. Timestamps are plain date fields written by the
// Worker rather than autodate fields, so the seed can backdate records and a
// future datastore needs no special handling.
migrate(
  (app) => {
    // The stock auth collection stores emails; IRL Page never does.
    try {
      app.delete(app.findCollectionByNameOrId("users"));
    } catch (_) {
      // Already gone.
    }

    const locked = {
      type: "base",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    };
    const date = (name) => ({ name, type: "date" });
    const relation = (name, collection, maxSelect = 1) => ({
      name,
      type: "relation",
      collectionId: collection.id,
      cascadeDelete: false,
      minSelect: 0,
      maxSelect,
    });

    const people = new Collection({
      ...locked,
      name: "people",
      fields: [
        { name: "email_hash", type: "text", required: true, max: 64 },
        {
          name: "avatar_kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["oauth", "url", "emoji", "blocky"],
        },
        { name: "avatar_value", type: "text", max: 500 },
        { name: "onboarded", type: "bool" },
        date("created"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_people_email_hash` ON `people` (`email_hash`)",
      ],
    });
    app.save(people);

    const venues = new Collection({
      ...locked,
      name: "venues",
      fields: [
        { name: "name", type: "text", required: true, max: 120 },
        { name: "address", type: "text", max: 240 },
        { name: "lat", type: "number" },
        { name: "lng", type: "number" },
        { name: "osm_id", type: "text", max: 40 },
        date("created"),
        date("updated"),
      ],
      indexes: [
        "CREATE INDEX `idx_venues_lat_lng` ON `venues` (`lat`, `lng`)",
        "CREATE INDEX `idx_venues_osm_id` ON `venues` (`osm_id`)",
      ],
    });
    app.save(venues);

    const tickets = new Collection({
      ...locked,
      name: "tickets",
      fields: [
        { name: "code", type: "text", required: true, max: 16 },
        relation("creator", people),
        relation("participants", people, 20),
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["open", "submitted"],
        },
        relation("venue", venues),
        { name: "venue_draft", type: "json", maxSize: 2000 },
        date("submitted_at"),
        date("created"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_tickets_code` ON `tickets` (`code`)",
        "CREATE INDEX `idx_tickets_creator` ON `tickets` (`creator`)",
        "CREATE INDEX `idx_tickets_venue` ON `tickets` (`venue`)",
      ],
    });
    app.save(tickets);

    const nodes = new Collection({
      ...locked,
      name: "nodes",
      fields: [
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["person", "venue"],
        },
        relation("user", people),
        relation("venue", venues),
        date("created"),
        date("updated"),
      ],
      indexes: [
        "CREATE INDEX `idx_nodes_user` ON `nodes` (`user`)",
        "CREATE INDEX `idx_nodes_venue` ON `nodes` (`venue`)",
      ],
    });
    app.save(nodes);

    const edges = new Collection({
      ...locked,
      name: "edges",
      fields: [relation("a", nodes), relation("b", nodes), date("created")],
      indexes: [
        "CREATE INDEX `idx_edges_a` ON `edges` (`a`)",
        "CREATE INDEX `idx_edges_b` ON `edges` (`b`)",
      ],
    });
    app.save(edges);
  },
  (app) => {
    for (const name of ["edges", "nodes", "tickets", "venues", "people"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
