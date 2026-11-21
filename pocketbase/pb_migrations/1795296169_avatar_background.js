/// <reference path="../pb_data/types.d.ts" />

// The colour behind a person's avatar: lowercase #rrggbb, or "" for the
// default. The pattern matches normalizeColor's output in shared/avatar.ts.
migrate(
  (app) => {
    const people = app.findCollectionByNameOrId("people");
    people.fields.add(
      new TextField({
        name: "avatar_background",
        max: 7,
        pattern: "^(#[0-9a-f]{6})?$",
      }),
    );
    app.save(people);
  },
  (app) => {
    const people = app.findCollectionByNameOrId("people");
    people.fields.removeByName("avatar_background");
    app.save(people);
  },
);
