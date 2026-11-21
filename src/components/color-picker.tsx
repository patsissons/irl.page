import { useId, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { AVATAR_SWATCHES, normalizeColor } from "@shared/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A colour, three ways: a saturation square with a hue strip for any
 * colour, a grid of quick picks beside it, and a hex field below. Each one
 * updates the others. `undefined` is the default (no colour picked), which
 * the square shows as `fallback`. Loaded lazily, like the emoji picker.
 */
export default function ColorPicker({
  value,
  fallback = "#ffffff",
  onChange,
  label = "Background colour",
}: {
  value: string | undefined;
  fallback?: string;
  onChange: (color: string | undefined) => void;
  label?: string;
}) {
  const hexId = useId();
  const [text, setText] = useState(value ?? "");
  // Follow a colour picked in the square or the grid, but leave alone text
  // that already means it ("#0af" while typing on to "#0afe12").
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if ((normalizeColor(text) ?? undefined) !== value) setText(value ?? "");
  }

  const pick = (color: string) => onChange(normalizeColor(color) ?? undefined);

  function type(next: string) {
    setText(next);
    if (next.trim() === "") onChange(undefined);
    else {
      const color = normalizeColor(next);
      if (color) onChange(color);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-4">
        <HexColorPicker
          className="color-square"
          color={value ?? fallback}
          onChange={pick}
        />
        <div
          role="group"
          aria-label="Quick colours"
          className="grid grid-cols-6 content-start gap-1.5"
        >
          {AVATAR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={swatch === value}
              title={swatch}
              onClick={() => onChange(swatch)}
              style={{ background: swatch }}
              className={cn(
                "size-7 rounded-md ring-1 ring-border transition",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                "aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-background",
              )}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={hexId} className="text-sm text-muted-foreground">
          Hex
        </label>
        <input
          id={hexId}
          aria-label={`${label} hex`}
          aria-invalid={text.trim() !== "" && !normalizeColor(text)}
          spellCheck={false}
          autoComplete="off"
          placeholder="Default"
          maxLength={7}
          value={text}
          onChange={(event) => type(event.target.value)}
          onBlur={() => setText(value ?? "")}
          className="block h-9 w-28 rounded-lg border border-input bg-background px-3 font-mono text-sm aria-invalid:border-destructive"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={value === undefined}
          onClick={() => onChange(undefined)}
        >
          Default
        </Button>
      </div>
    </div>
  );
}
