import type { CSSProperties } from "react";
import type { Subscription, WidgetSize } from "../lib/types";
import { CircleX, EyeOff, Pin, Power, RotateCcw, SettingsIcon, SquarePen, STROKE, Trash2 } from "./icons";
import { MenuItem, MenuSep, Popover, Segmented } from "./ui";

export const WIDGET_MENU_W = 252;
export const WIDGET_MENU_H = 262;
export const ROW_MENU_W = 232;
export const ROW_MENU_H = 128;

/** Widget menu (Figma screen 4): size, settings, keep on top, hide, quit. */
export function WidgetMenu({
  style,
  size,
  keepOnTop,
  onSize,
  onSettings,
  onKeepOnTop,
  onHide,
  onQuit,
  onClose,
}: {
  style: CSSProperties;
  size: WidgetSize;
  keepOnTop: boolean;
  onSize: (s: WidgetSize) => void;
  onSettings: () => void;
  onKeepOnTop: (v: boolean) => void;
  onHide: () => void;
  onQuit: () => void;
  onClose: () => void;
}) {
  return (
    <Popover label="Widget menu" onClose={onClose} style={{ width: WIDGET_MENU_W, ...style }}>
      <div className="menu-group">
        <span className="t-cap12m c-tertiary">Widget size</span>
        <Segmented<WidgetSize>
          value={size}
          onChange={onSize}
          options={[
            { value: "full", label: "Full" },
            { value: "medium", label: "Medium" },
            { value: "small", label: "Small" },
          ]}
        />
      </div>
      <MenuSep />
      <MenuItem icon={<SettingsIcon size={16} strokeWidth={STROKE} />} label="Settings" shortcut="Ctrl+," onSelect={onSettings} />
      <MenuItem
        icon={<Pin size={16} strokeWidth={STROKE} />}
        label="Keep on top"
        onSelect={() => onKeepOnTop(!keepOnTop)}
        checked={keepOnTop}
        trailing={<span className="switch" aria-checked={keepOnTop} aria-hidden />}
      />
      <MenuItem icon={<EyeOff size={16} strokeWidth={STROKE} />} label="Hide widget" shortcut="Ctrl+Alt+S" onSelect={onHide} />
      <MenuSep />
      <MenuItem icon={<Power size={16} strokeWidth={STROKE} />} label="Quit" onSelect={onQuit} />
    </Popover>
  );
}

/** Row menu (Figma screen 3): Edit, Mark as cancelled, Delete. Same menu on ⋯, right-click and Shift+F10. */
export function RowMenu({
  sub,
  style,
  onEdit,
  onCancel,
  onRestore,
  onDelete,
  onClose,
}: {
  sub: Subscription;
  style: CSSProperties;
  onEdit: () => void;
  onCancel: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Popover label={`${sub.name} actions`} onClose={onClose} style={{ width: ROW_MENU_W, ...style }}>
      <MenuItem icon={<SquarePen size={16} strokeWidth={STROKE} />} label="Edit" shortcut="Enter" onSelect={onEdit} />
      {sub.status === "active" ? (
        <MenuItem icon={<CircleX size={16} strokeWidth={STROKE} />} label="Mark as cancelled" onSelect={onCancel} />
      ) : (
        <MenuItem icon={<RotateCcw size={16} strokeWidth={STROKE} />} label="Restore" onSelect={onRestore} />
      )}
      <MenuSep />
      <MenuItem icon={<Trash2 size={16} strokeWidth={STROKE} />} label="Delete" shortcut="Del" danger onSelect={onDelete} />
    </Popover>
  );
}
