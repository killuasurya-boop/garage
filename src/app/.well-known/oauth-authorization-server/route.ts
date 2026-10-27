import { serveMcpChatgptDiscovery } from "@/lib/mcp-chatgpt-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = serveMcpChatgptDiscovery;
export const HEAD = serveMcpChatgptDiscovery;
