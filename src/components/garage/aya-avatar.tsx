// Avatar Aya — potongan wajah maskot V2 (OD-02) lewat AyaCharacter supaya
// panel AI, notifikasi, dan pet melayang memakai satu desain. Teks status tetap ditulis
// di samping avatar (avatar tidak menggantikan label).
import { AyaCharacter, type AyaExpression } from "@/components/garage/aya/aya-character";
import { AYA_NAME } from "@/lib/garage-ai-persona";

export function AyaAvatar({
  size = 32,
  className = "",
  decorative = false,
  expression = "default",
}: {
  size?: number;
  className?: string;
  decorative?: boolean;
  expression?: AyaExpression;
}) {
  return (
    <span className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <AyaCharacter crop="head" expression={expression} title={decorative ? undefined : `${AYA_NAME}, AI pet Garage Coffee`} />
    </span>
  );
}
