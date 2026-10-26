import type { Metadata } from "next";

import { StaffRegister } from "@/components/garage/staff-register";

export const metadata: Metadata = {
  title: "Daftar Karyawan | Garage Coffee",
};

export default function StaffRegisterPage() {
  return <StaffRegister />;
}
