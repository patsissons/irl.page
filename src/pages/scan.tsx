import { useEffect, useRef, useState, type FormEvent } from "react";
import QrScanner from "qr-scanner";
import { useNavigate } from "react-router";
import { parseTicketLink } from "@shared/ids";
import { Button } from "@/components/ui/button";

/** Scan a ticket's QR code with the camera, or type its code. */
export default function Scan() {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState(false);

  useEffect(() => {
    if (!video.current) return;
    const scanner = new QrScanner(
      video.current,
      (result) => {
        const code = parseTicketLink(result.data);
        if (!code) return;
        scanner.stop();
        navigate(`/ticket/${code}`);
      },
      { highlightScanRegion: true, returnDetailedScanResult: true },
    );
    scanner.start().catch(() => {
      setCameraError(
        "The camera isn't available. Allow camera access, or type the code below.",
      );
    });
    return () => {
      scanner.destroy();
    };
  }, [navigate]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = parseTicketLink(typed);
    if (code) navigate(`/ticket/${code}`);
    else setTypedError(true);
  }

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold">Scan a ticket</h1>
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-stage">
        <video
          ref={video}
          muted
          playsInline
          className="size-full object-cover"
        />
        {cameraError && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">
            {cameraError}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="grid gap-2">
        <label htmlFor="ticket-code" className="text-sm font-medium">
          Or enter the ticket code
        </label>
        <div className="flex gap-2">
          <input
            id="ticket-code"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setTypedError(false);
            }}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder="abcd2345"
            aria-invalid={typedError}
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 font-mono"
          />
          <Button type="submit" size="lg" className="h-11">
            Open
          </Button>
        </div>
        {typedError && (
          <p role="alert" className="text-sm text-destructive">
            That doesn&apos;t look like a ticket code or link.
          </p>
        )}
      </form>
    </div>
  );
}
