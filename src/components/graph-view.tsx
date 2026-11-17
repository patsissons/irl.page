import { useCallback, useEffect, useMemo, useRef } from "react";
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
  x?: number;
  y?: number;
  z?: number;
}

interface Link {
  source: string;
  target: string;
  social: boolean;
}

const VENUE_COLOR = "#ff6b57";
const FOCUS_COLOR = "#ffd27a";
const SOCIAL_LINK = "rgba(255,255,255,0.28)";
const VENUE_LINK = "rgba(255,107,87,0.45)";
/** How far the camera sits from a node it has flown to. */
const CLOSE_UP = 110;

/**
 * Node objects by id, kept between renders. The layout stores positions on
 * them, so narrowing the graph to a focus (and widening it again) leaves
 * every node where it was instead of restarting from scratch.
 */
const nodes = new Map<string, Node>();
function node(next: Node): Node {
  const existing = nodes.get(next.id);
  if (existing) return Object.assign(existing, next);
  nodes.set(next.id, next);
  return next;
}

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
/** Textures by avatar, so re-drawing a node doesn't rebuild its picture. */
const textures = new Map<string, THREE.Texture>();
function drawnTexture(avatar: Avatar, id: string): THREE.Texture {
  const emoji = avatar.kind === "emoji";
  const key = emoji ? `emoji:${avatar.value}` : `blocky:${id}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = loader.load(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        avatarSvg(
          { kind: emoji ? "emoji" : "blocky", value: avatar.value },
          id,
        ),
      )}`,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, texture);
  }
  return texture;
}

/** A person is drawn as their avatar, always facing the camera. */
function personSprite(person: Node, focused: boolean): THREE.Object3D {
  const avatar = person.avatar ?? { kind: "blocky" as const, value: "" };
  const id = person.userId ?? person.id;
  const material = new THREE.SpriteMaterial({ depthWrite: false });
  if (avatar.kind === "url" || avatar.kind === "oauth") {
    // A picture needs CORS to become a texture; fall back to the blocky.
    material.map = loader.load(avatar.value, undefined, undefined, () => {
      material.map = drawnTexture({ kind: "blocky", value: "" }, id);
      material.needsUpdate = true;
    });
    material.map.colorSpace = THREE.SRGBColorSpace;
  } else {
    material.map = drawnTexture(avatar, id);
  }
  const sprite = new THREE.Sprite(material);
  const size = focused ? 22 : 13;
  sprite.scale.set(size, size, 1);
  return sprite;
}

const linkColor = (link: Link) => (link.social ? SOCIAL_LINK : VENUE_LINK);

/**
 * The force-directed graph: venues as coral spheres, people as avatars.
 * Clicking a node flies the camera to it and reports it through `onFocus`.
 */
export default function GraphView({
  graph,
  focusId,
  onFocus,
  width,
  height,
}: {
  graph: GraphData;
  focusId: string | null;
  onFocus: (id: string) => void;
  width: number;
  height: number;
}) {
  const ref = useRef<ForceGraphMethods<Node, Link>>(undefined);
  /** Set when the data changes: frame it once the layout settles. */
  const fitPending = useRef(true);

  const data = useMemo(() => {
    const venues = new Set(graph.venues.map((venue) => venue.id));
    const all: Node[] = [
      ...graph.venues.map((venue) =>
        node({
          id: venue.id,
          kind: "venue",
          label: `${venue.name} · ${venue.visits} visits`,
          value: 1 + Math.sqrt(venue.visits) * 0.6,
        }),
      ),
      ...graph.people.map((person) =>
        node({
          id: person.id,
          kind: "person",
          label: `Person ${person.userId.slice(0, 6)}`,
          value: 2,
          avatar: person.avatar,
          userId: person.userId,
        }),
      ),
    ];
    const links: Link[] = graph.links.map((link) => ({
      source: link.source,
      target: link.target,
      social: !venues.has(link.source) && !venues.has(link.target),
    }));
    return { nodes: all, links };
  }, [graph]);

  useEffect(() => {
    fitPending.current = true;
    // Venue links pull harder than social ones, so venues read as hubs.
    ref.current
      ?.d3Force("link")
      ?.strength((link: Link) => (link.social ? 0.05 : 0.5));
  }, [data]);

  const nodeThreeObject = useCallback(
    (item: Node) =>
      item.kind === "person"
        ? personSprite(item, item.id === focusId)
        : (undefined as never),
    [focusId],
  );
  const nodeColor = useCallback(
    (item: Node) => (item.id === focusId ? FOCUS_COLOR : VENUE_COLOR),
    [focusId],
  );

  const onNodeClick = useCallback(
    (item: Node) => {
      // Fly to a point on the line from the centre through the node, a
      // little beyond it, looking back at the node.
      const { x = 0, y = 0, z = 0 } = item;
      const reach = Math.hypot(x, y, z) || 1;
      const ratio = 1 + CLOSE_UP / reach;
      ref.current?.cameraPosition(
        { x: x * ratio, y: y * ratio, z: z * ratio },
        { x, y, z },
        800,
      );
      onFocus(item.id);
    },
    [onFocus],
  );

  const onEngineStop = useCallback(() => {
    if (!fitPending.current) return;
    fitPending.current = false;
    ref.current?.zoomToFit(600, 60);
  }, []);

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
      nodeColor={nodeColor}
      nodeOpacity={0.95}
      nodeThreeObject={nodeThreeObject}
      linkColor={linkColor}
      linkOpacity={0.5}
      linkWidth={0}
      enableNodeDrag={false}
      warmupTicks={40}
      cooldownTicks={150}
      onNodeClick={onNodeClick}
      onEngineStop={onEngineStop}
    />
  );
}
