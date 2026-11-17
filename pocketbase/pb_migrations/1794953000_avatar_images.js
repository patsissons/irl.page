/// <reference path="../pb_data/types.d.ts" />

// Avatars can be small images inlined as data: URIs (an image link or a copy
// of a Gravatar), so avatar_value grows from 500 to MAX_DATA_URI in
// shared/avatar.ts, and avatar_kind gains "gravatar".
migrate(
  (app) => {
    const people = app.findCollectionByNameOrId("people");
    people.fields.getByName("avatar_value").max = 16384;
    people.fields.getByName("avatar_kind").values = [
      "oauth",
      "gravatar",
      "url",
      "emoji",
      "blocky",
    ];
    app.save(people);
  },
  (app) => {
    const people = app.findCollectionByNameOrId("people");
    people.fields.getByName("avatar_value").max = 500;
    people.fields.getByName("avatar_kind").values = [
      "oauth",
      "url",
      "emoji",
      "blocky",
    ];
    app.save(people);
  },
);
