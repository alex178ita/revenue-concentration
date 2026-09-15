/* eslint-disable @next/next/no-img-element */
export default function Logo({ height = 28 }: { height?: number }) {
  return (
    <picture className="logo">
      <source srcSet="/kleecks-logo-white.png" media="(prefers-color-scheme: dark)" />
      <img src="/kleecks-logo-black.png" alt="Kleecks" style={{ height, width: 'auto' }} />
    </picture>
  );
}
