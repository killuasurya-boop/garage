import { redirect } from "next/navigation";

// Route absen lama disatukan ke /absen (NAV_ACTION_AUDIT §1.8 anti-duplikat).
// /absen otomatis memilih Payroll V2 atau terminal legacy sesuai flag.
export default function AttendancePage() {
  redirect("/absen");
}
