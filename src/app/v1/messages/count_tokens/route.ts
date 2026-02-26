import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    type: "error",
    error: {
      type: "not_implemented",
      message: "Token counting is not supported by this proxy.",
    },
  }, { status: 501 });
}
