import React, { useEffect, useRef, useState } from "react";
import {
  IsoRoomPixiEngine,
  type EditCommand,
  type EngineEvent,
} from "@iso-room/pixi";
import type { LayoutDocument, PlacedEntity, ValidationIssue } from "iso-room-schema";

export interface IsoRoomEditorProps {
  initialLayout: LayoutDocument;
  onChange?: (layout: LayoutDocument) => void;
  className?: string;
}

export function IsoRoomEditor({ initialLayout, onChange, className = "" }: IsoRoomEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<IsoRoomPixiEngine | undefined>(undefined);
  const [layout, setLayout] = useState(initialLayout);
  const [selection, setSelection] = useState<string[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [mode, setMode] = useState<"build" | "play">("build");
  const [zoom, setZoom] = useState(1);
  const [importText, setImportText] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const instance = new IsoRoomPixiEngine(initialLayout);
    engine.current = instance;
    let unsubscribe: () => void = () => undefined;
    void instance.mount(host.current).then(() => {
      unsubscribe = instance.subscribe((event: EngineEvent) => {
        if (event.type === "layout") {
          setLayout(event.layout); setCanUndo(instance.canUndo()); setCanRedo(instance.canRedo()); onChange?.(event.layout);
        }
        if (event.type === "selection") setSelection(event.ids);
        if (event.type === "validation") setIssues([...event.result.errors, ...event.result.warnings]);
        if (event.type === "mode") setMode(event.mode);
      });
    });
    return () => { unsubscribe(); instance.destroy(); engine.current = undefined; };
  }, []);

  const execute = (command: EditCommand) => engine.current?.execute(command);
  const selectedEntities = layout.entities.filter((entity) => selection.includes(entity.id));
  const addCrate = () => {
    const occupied = new Set(layout.entities.filter((entity) => entity.collision).map((entity) => `${entity.position.x},${entity.position.y}`));
    const tiles = layout.floors.flatMap((floor) => floor.tiles);
    const position = tiles.find((tile) => tile.x > 0 && tile.y > 0 && !occupied.has(`${tile.x},${tile.y}`))
      ?? tiles.find((tile) => !(tile.x === 0 && tile.y === 0) && !occupied.has(`${tile.x},${tile.y}`)) ?? { x: 1, y: 1 };
    const id = `crate.${Date.now().toString(36)}`;
    const entity: PlacedEntity = {
      id, name: "Crate", assetId: "procedural.crate", roomId: layout.rooms[0]?.id ?? "room.main",
      position, footprint: { width: 1, height: 1 }, rotation: 0,
      elevation: 0, collision: true, layer: "furniture",
    };
    execute({ type: "entity.add", entity }); engine.current?.select([id]);
  };
  const download = () => {
    const data = engine.current?.exportJSON(); if (!data) return;
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    anchor.download = "room.layout.json"; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  const changeZoom = (next: number) => {
    const safe = Math.max(0.25, Math.min(4, next)); setZoom(safe); engine.current?.setCamera({ zoom: safe });
  };
  const addWall = (kind?: "door" | "window") => {
    const directions = ["north", "east", "south", "west"] as const;
    const existing = new Set(layout.walls.map((wall) => `${wall.tile.x},${wall.tile.y},${wall.direction}`));
    const edge = layout.floors.flatMap((floor) => floor.tiles).flatMap((tile) => directions.map((direction) => ({ tile, direction })))
      .find(({ tile, direction }) => !existing.has(`${tile.x},${tile.y},${direction}`));
    if (!edge) return;
    const id = `wall.${Date.now().toString(36)}`;
    execute({ type: "wall.add", wall: { id, roomId: layout.rooms[0]?.id ?? "room.main", tile: edge.tile, direction: edge.direction } });
    if (kind) execute({ type: "opening.add", opening: { id: `${kind}.${id}`, wallId: id, kind, passable: kind === "door" } });
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (mode === "play") return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? engine.current?.redo() : engine.current?.undo(); }
    if (command && event.key.toLowerCase() === "d") { event.preventDefault(); execute({ type: "entity.duplicate", ids: selection }); }
    if (event.key === "Delete" || event.key === "Backspace") execute({ type: "entity.remove", ids: selection });
    if (event.key.toLowerCase() === "r") execute({ type: "entity.rotate", ids: selection });
    const deltas: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    };
    if (deltas[event.key]) { event.preventDefault(); execute({ type: "entity.move", ids: selection, delta: deltas[event.key]! }); }
  };

  useEffect(() => {
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [mode, selection]);

  return (
    <div className={`iso-editor ${className}`} tabIndex={0}>
      <nav className="iso-toolbar" aria-label="Layout editing tools">
        <strong>Build tools</strong>
        <button onClick={addCrate} disabled={mode === "play"}>Place crate</button>
        <button onClick={() => execute({ type: "floor.paint", floorId: layout.floors[0]?.id ?? "floor.main", tiles: [{ x: layout.grid.width - 1, y: layout.grid.height - 1 }] })} disabled={mode === "play"}>Paint floor tile</button>
        <button onClick={() => execute({ type: "floor.paint", floorId: layout.floors[0]?.id ?? "floor.main", tiles: [{ x: layout.grid.width - 1, y: layout.grid.height - 1 }], remove: true })} disabled={mode === "play"}>Erase floor tile</button>
        <button onClick={() => addWall()} disabled={mode === "play"}>Place wall</button>
        <button onClick={() => addWall("door")} disabled={mode === "play"}>Insert door</button>
        <button onClick={() => addWall("window")} disabled={mode === "play"}>Insert window</button>
        <button onClick={() => execute({ type: "room.resize", width: layout.grid.width + 1, height: layout.grid.height + 1 })} disabled={mode === "play"}>Grow room</button>
        <button onClick={() => execute({ type: "entity.rotate", ids: selection })} disabled={!selection.length || mode === "play"}>Rotate selection</button>
        <button onClick={() => execute({ type: "entity.duplicate", ids: selection })} disabled={!selection.length || mode === "play"}>Duplicate selection</button>
        <button onClick={() => execute({ type: "entity.remove", ids: selection })} disabled={!selection.length || mode === "play"}>Delete selection</button>
        <button onClick={() => execute({ type: "entity.layer", ids: selection, layer: "decor" })} disabled={!selection.length || mode === "play"}>Move to decor layer</button>
        <span>Move selection:
          <button aria-label="Move selection left" disabled={!selection.length || mode === "play"} onClick={() => execute({ type: "entity.move", ids: selection, delta: { x: -1, y: 0 } })}>←</button>
          <button aria-label="Move selection up" disabled={!selection.length || mode === "play"} onClick={() => execute({ type: "entity.move", ids: selection, delta: { x: 0, y: -1 } })}>↑</button>
          <button aria-label="Move selection down" disabled={!selection.length || mode === "play"} onClick={() => execute({ type: "entity.move", ids: selection, delta: { x: 0, y: 1 } })}>↓</button>
          <button aria-label="Move selection right" disabled={!selection.length || mode === "play"} onClick={() => execute({ type: "entity.move", ids: selection, delta: { x: 1, y: 0 } })}>→</button>
        </span>
        <button onClick={() => engine.current?.undo()} disabled={!canUndo || mode === "play"}>Undo</button>
        <button onClick={() => engine.current?.redo()} disabled={!canRedo || mode === "play"}>Redo</button>
        <button onClick={() => setIssues(engine.current?.validate().errors ?? [])}>Validate layout</button>
        <button onClick={() => {
          const next = mode === "build" ? "play" : "build";
          const result = engine.current?.setMode(next);
          if (result?.valid) setMode(next); else setIssues(result?.errors ?? []);
        }}>{mode === "build" ? "Start play test" : "Return to build"}</button>
        <button disabled={mode !== "play"} onClick={() => {
          const start = layout.spawnPoints[0]?.position ?? { x: 0, y: 0 };
          engine.current?.queryPath(start, { x: layout.grid.width - 1, y: layout.grid.height - 1 });
        }}>Navigate avatar</button>
        <button onClick={download}>Export JSON</button>
        <label>Import JSON<textarea value={importText} onChange={(event) => setImportText(event.target.value)} /></label>
        <button onClick={() => {
          const result = engine.current?.loadLayout(importText);
          if (result) setIssues(result.errors);
        }}>Load imported layout</button>
        <label>Zoom
          <input aria-label="Zoom" type="range" min=".25" max="4" step=".25" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} />
        </label>
        <span>Pan: <button onClick={() => engine.current?.setCamera({ x: -64 })}>Left</button> <button onClick={() => engine.current?.setCamera({ x: 64 })}>Right</button></span>
      </nav>
      <main className="iso-stage" aria-label="Isometric room canvas">
        <div ref={host} role="img" aria-label={`${layout.metadata.title}, ${layout.entities.length} objects`} />
      </main>
      <aside className="iso-inspector" aria-label="Object and room inspector">
        <h2>{layout.metadata.title}</h2>
        <p>{layout.grid.width} × {layout.grid.height} tiles · {mode} mode</p>
        <h3>Objects</h3>
        <ul>{layout.entities.map((entity) => <li key={entity.id}>
          <button aria-pressed={selection.includes(entity.id)} onClick={(event) => engine.current?.select([entity.id], event.shiftKey)}>{entity.name} ({entity.position.x}, {entity.position.y})</button>
        </li>)}</ul>
        {selectedEntities.map((entity) => <section key={entity.id}><h3>{entity.name}</h3><p>Rotation {entity.rotation}° · layer {entity.layer ?? "default"}</p></section>)}
        <h3>Walls and openings</h3>
        <ul>{layout.walls.map((wall) => {
          const opening = layout.openings.find((item) => item.wallId === wall.id);
          return <li key={wall.id}>{wall.direction} edge{opening ? ` · ${opening.kind}` : ""} <button onClick={() => execute({ type: "wall.remove", ids: [wall.id] })}>Remove</button></li>;
        })}</ul>
        <h3>Validation</h3>
        <ul aria-live="polite">{issues.length ? issues.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>) : <li>No reported issues</li>}</ul>
      </aside>
    </div>
  );
}
