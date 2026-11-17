import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { avatarSvg } from "@shared/avatar";
import type { Avatar, GraphData } from "@shared/types";

interface Node {
  id: string;
  kind: "person" | "venue";
  label: string;
  value: number;
  avatar?: Avatar;
  userId?: string;
}

interface Link {
  source: string;
  target: string;
  social: boolean;
}

const VENUE_COLOR = "#ff6b57";
const SOCIAL_LINK = "rgba(255,255,255,0.28)";
const VENUE_LINK = "rgba(255,107,87,0.45)";

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
const fallbackTexture = (avatar: Avatar, id: string) =>
  loader.load(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      avatarSvg(
        {
          kind: avatar.kind === "emoji" ? "emoji" : "blocky",
          value: avatar.value,
        },
        id,
      ),
    )}`,
  );

/** A person is drawn as their avatar, always facing the camera. */
function personSprite(node: Node): THREE.Object3D {
  const avatar = node.avatar ?? { kind: "blocky" as const, value: "" };
  const id = node.userId ?? node.id;
  const material = new THREE.SpriteMaterial({ depthWrite: false });
  if (avatar.kind === "url" || avatar.kind === "oauth") {
    // A picture needs CORS to become a texture; fall back to the blocky.
    material.map = loader.load(avatar.value, undefined, undefined, () => {
      material.map = fallbackTexture({ kind: "blocky", value: "" }, id);
      material.needsUpdate = true;
    });
  } else {
    material.map = fallbackTexture(avatar, id);
  }
  material.map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(13, 13, 1);
  return sprite;
}

/** The force-directed graph: venues as coral spheres, people as avatars. */
export default function GraphView({
  graph,
  width,
  height,
}: {
  graph: GraphData;
  width: number;
  height: number;
}) {
  const ref = useRef<ForceGraphMethods<Node, Link>>(undefined);

  const data = useMemo(() => {
    const venues = new Set(graph.venues.map((venue) => venue.id));
    const nodes: Node[] = [
      ...graph.venues.map((venue) => ({
        id: venue.id,
        kind: "venue" as const,
        label: `${venue.name} · ${venue.visits} visits`,
        value: 1 + Math.sqrt(venue.visits) * 0.6,
      })),
      ...graph.people.map((person) => ({
        id: person.id,
        kind: "person" as const,
        label: `Person ${person.userId.slice(0, 6)}`,
        value: 2,
        avatar: person.avatar,
        userId: person.userId,
      })),
    ];
    const links: Link[] = graph.links.map((link) => ({
      source: link.source,
      target: link.target,
      social: !venues.has(link.source) && !venues.has(link.target),
    }));
    return { nodes, links };
  }, [graph]);

  useEffect(() => {
    // Venue links pull harder than social ones, so venues read as hubs.
    ref.current
      ?.d3Force("link")
      ?.strength((link: Link) => (link.social ? 0.05 : 0.5));
  }, [data]);

  return (
    <ForceGraph3D
      ref={ref}
      graphData={data}
      width={width}
      height={height}
      backgroundColor="#0b0b12"
      showNavInfo={false}
      nodeLabel="label"
      nodeVal="value"
      nodeColor={() => VENUE_COLOR}
      nodeOpacity={0.95}
      nodeThreeObject={(node: Node) =>
        node.kind === "person" ? personSprite(node) : (undefined as never)
      }
      linkColor={(link: Link) => (link.social ? SOCIAL_LINK : VENUE_LINK)}
      linkOpacity={0.5}
      linkWidth={0}
      enableNodeDrag={false}
      warmupTicks={40}
      cooldownTicks={150}
      // Frame the whole network once the layout settles.
      onEngineStop={() => ref.current?.zoomToFit(600, 40)}
    />
  );
}
