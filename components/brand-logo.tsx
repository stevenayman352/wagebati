import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  priority
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-border/60 shadow-raise",
        className
      )}
    >
      <Image
        src="/image.png"
        alt="واجباتي"
        width={1254}
        height={1254}
        priority={priority}
        className="size-full object-cover"
      />
    </span>
  );
}