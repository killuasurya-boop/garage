/** MP3 statis di public — sumber utama Smart Notification (tanpa API runtime). */

export const VOICE_SCENARIO_PUBLIC_BASE = "/voice/scenarios";

export const VOICE_SCENARIO_AUDIO_URLS = {
  order_new: `${VOICE_SCENARIO_PUBLIC_BASE}/order-new.mp3`,
  order_new_kitchen: `${VOICE_SCENARIO_PUBLIC_BASE}/order-new-kitchen.mp3`,
  order_new_bar: `${VOICE_SCENARIO_PUBLIC_BASE}/order-new-bar.mp3`,
  airport_qr: `${VOICE_SCENARIO_PUBLIC_BASE}/airport-qr.mp3`,
  online_new: `${VOICE_SCENARIO_PUBLIC_BASE}/online-new.mp3`,
  kitchen_cooking: `${VOICE_SCENARIO_PUBLIC_BASE}/kitchen-cooking.mp3`,
  bar_mixing: `${VOICE_SCENARIO_PUBLIC_BASE}/bar-mixing.mp3`,
  order_ready: `${VOICE_SCENARIO_PUBLIC_BASE}/order-ready.mp3`,
  order_ready_deliver: `${VOICE_SCENARIO_PUBLIC_BASE}/order-ready-deliver.mp3`,
  warning_printer: `${VOICE_SCENARIO_PUBLIC_BASE}/warning-printer.mp3`,
  warning_lowstock: `${VOICE_SCENARIO_PUBLIC_BASE}/warning-lowstock.mp3`,
  approval_pending: `${VOICE_SCENARIO_PUBLIC_BASE}/approval-pending.mp3`,
  cash_anomaly: `${VOICE_SCENARIO_PUBLIC_BASE}/cash-anomaly.mp3`,
  delivery_pickup: `${VOICE_SCENARIO_PUBLIC_BASE}/delivery-pickup.mp3`,
  member_vip: `${VOICE_SCENARIO_PUBLIC_BASE}/member-vip.mp3`,
  audit_alert: `${VOICE_SCENARIO_PUBLIC_BASE}/audit-alert.mp3`,
  waiter_call: `${VOICE_SCENARIO_PUBLIC_BASE}/waiter-call.mp3`,
  waiter_bill_request: `${VOICE_SCENARIO_PUBLIC_BASE}/waiter-bill-request.mp3`,
  waiter_clear_table: `${VOICE_SCENARIO_PUBLIC_BASE}/waiter-clear-table.mp3`,
  waiter_reservation: `${VOICE_SCENARIO_PUBLIC_BASE}/waiter-reservation.mp3`,
  waiter_refill: `${VOICE_SCENARIO_PUBLIC_BASE}/waiter-refill.mp3`,
  waiter_special_request: `${VOICE_SCENARIO_PUBLIC_BASE}/waiter-special-request.mp3`,
  ai_alert_high: `${VOICE_SCENARIO_PUBLIC_BASE}/ai-alert-high.mp3`,
  test_ceo: `${VOICE_SCENARIO_PUBLIC_BASE}/test-ceo.mp3`,
  voice_command_ack: `${VOICE_SCENARIO_PUBLIC_BASE}/voice-command-ack.mp3`,
  role_alert: `${VOICE_SCENARIO_PUBLIC_BASE}/role-alert.mp3`,
  staff_monitor: `${VOICE_SCENARIO_PUBLIC_BASE}/staff-monitor.mp3`,
  autopilot_alert: `${VOICE_SCENARIO_PUBLIC_BASE}/autopilot-alert.mp3`,
  product_management_alert: `${VOICE_SCENARIO_PUBLIC_BASE}/product-management-alert.mp3`,
  finance_alert: `${VOICE_SCENARIO_PUBLIC_BASE}/finance-alert.mp3`,
  membership_approval: `${VOICE_SCENARIO_PUBLIC_BASE}/membership-approval.mp3`,
  owner_chat_ping: `${VOICE_SCENARIO_PUBLIC_BASE}/owner-chat-ping.mp3`,
} as const;

export type VoiceScenarioWithAudio = keyof typeof VOICE_SCENARIO_AUDIO_URLS;

export function getScenarioAudioUrl(scenario: VoiceScenarioWithAudio): string {
  return VOICE_SCENARIO_AUDIO_URLS[scenario];
}
