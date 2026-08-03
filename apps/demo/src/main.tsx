import React from "react";
import { createRoot } from "react-dom/client";
import { IsoRoomEditor } from "@iso-room/pixi-editor-react";
import { createEmptyLayout } from "@iso-room/pixi";
import "./style.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<IsoRoomEditor initialLayout={createEmptyLayout(12, 12)} />);
