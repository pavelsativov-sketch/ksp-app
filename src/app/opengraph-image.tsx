import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { ImageResponse } from "next/og";

export const alt = "Mekty — комплект к уроку за 5 минут";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function opengraphImage() {
  const rowStyle = { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid #e9eff8", borderRadius: 18, padding: "20px 24px", fontSize: 24, fontWeight: 800, boxShadow: "0 12px 35px rgba(48,76,145,.10)" };
  const dotStyle = { display: "flex", width: 12, height: 12, borderRadius: 4, background: "#4263eb", flexShrink: 0 };

  const rows = ["КСП по шаблону РК", "Рабочие листы", "Презентации", "Русский и казахский"].map((text) => (
    <div key={text} style={rowStyle}>
      <div style={dotStyle} />
      <div style={{ display: "flex" }}>{text}</div>
    </div>
  ));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "72px 84px", background: "linear-gradient(120deg,#f8fbff 55%,#e9f3ff)", color: "#172447", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 660 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 40 }}>
            <div style={{ display: "flex", width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#4263eb,#25c4db)", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 34, fontWeight: 700, transform: "rotate(-5deg)" }}>M</div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em" }}>{SITE_NAME}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.04em" }}>
            <div style={{ display: "flex" }}>Хороший урок.</div>
            <div style={{ display: "flex" }}>Спокойный вечер.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 34, fontSize: 27, lineHeight: 1.5, color: "#64728e", maxWidth: 560 }}>
            <div style={{ display: "flex" }}>{SITE_DESCRIPTION}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}>{rows}</div>
      </div>
    ),
    { ...size }
  );
}
