import { getServerSession } from "next-auth";
import { authOptions } from "../app/api/auth/[...nextauth]/authOptions";
import { NextResponse } from "next/server";

export async function checkAdminRole() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.role || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "This function is disabled for non-admin users" },
      { status: 403 }
    );
  }

  return null;
}
