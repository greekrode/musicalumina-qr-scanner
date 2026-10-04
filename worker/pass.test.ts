import { expect, test } from "bun:test";
import { decodePass } from "./pass";

// Same vector as musicalumina-tools/scripts/qr/pass.test.ts.
const VECTOR = "ML1:AE3G3R5T6D6UIX4372WVECQTJEUHONMUADW4KKR5TCOTDDOUUYOH2";

test("decodes passes minted by the generator", async () => {
  expect(await decodePass("test-secret", VECTOR, 0)).toEqual({
    kind: "participant",
    registrationId: "366dc7b3-f0fd-445f-9bfe-ad520a134928",
    expiresAt: 2_000_000_000,
  });
  await expect(decodePass("wrong", VECTOR, 0)).rejects.toThrow("signature");
});
