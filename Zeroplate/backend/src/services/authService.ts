import { User } from "../models/userModel";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env, googleEnabled } from "../config/env";

if (googleEnabled) {
  passport.use(
    new GoogleStrategy(
      { clientID: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, callbackURL: env.OAUTH_CALLBACK_URL! },
      async (_at, _rt, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          const verified = (profile as any)._json?.email_verified === true;
          if (!email || !verified) return done(new Error("Google account email is not verified"));
          let user = await User.findOne({ googleId: profile.id });
          let isNewUser = false;
          if (!user) {
            const existing = await User.findOne({ email });
            if (existing) {
              existing.googleId = profile.id; // link only because Google verified this email
              user = await existing.save();
            } else {
              isNewUser = true;
              user = await User.create({
                name: profile.displayName, email, googleId: profile.id, provider: "google",
                role: "receiver", roleChosen: false, location: { type: "Point", coordinates: [0, 0] },
              });
            }
          }
          (user as any).isNewUser = isNewUser;
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}
export default passport;
