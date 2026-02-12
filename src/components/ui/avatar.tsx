type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: AvatarSize;
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ src, name, size = "md" }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover ${sizeStyles[size]}`}
      />
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full font-medium ${sizeStyles[size]}`}
      style={{
        backgroundColor: "var(--accent-muted)",
        color: "var(--accent)",
      }}
    >
      {getInitials(name)}
    </div>
  );
}
