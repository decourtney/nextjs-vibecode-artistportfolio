import NextAuth, { DefaultSession } from "next-auth";
import { authOptions } from "./authOptions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
