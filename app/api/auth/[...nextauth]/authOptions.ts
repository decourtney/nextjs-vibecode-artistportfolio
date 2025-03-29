import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "../../../../lib/mongodb-adapter";
import connectDB from "@/lib/mongodb";
import Profile from "@/models/Profile";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  adapter: MongoDBAdapter(clientPromise),
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        // Fetch role from Profile model
        await connectDB();
        const profile = await Profile.findOne({ authId: user.id });
        session.user.role = profile?.role || "user";
        console.log("Setting user role in session:", session.user.role);
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
