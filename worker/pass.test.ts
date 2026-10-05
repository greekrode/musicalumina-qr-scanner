import { expect, test } from "bun:test";
import { decodePass } from "./pass";

// Same vector as musicalumina-tools/scripts/qr/pass.test.ts.
const VECTOR = "ML2:AE3G3R5T6D6UIX4372WVECQTJEUHONMUAA2DSMRYFUZTINJWJ2JCUIUNR7ADUCQW7CPA";

const PERFORMER_VECTOR = "ML2:AM3G3R5T6D6UIX4372WVECQTJEUHONMUAAATIOJSHAWTGNBVG3XZ2M5KBKY73XFAQQRXC";

test("decodes performer passes", async () => {
  expect(await decodePass("test-secret", PERFORMER_VECTOR, 0)).toEqual({
    kind: "performer",
    registrationId: "366dc7b3-f0fd-445f-9bfe-ad520a134928",
    expiresAt: 2_000_000_000,
    refCode: "4928-3456",
    performer: 1,
  });
});

test("decodes passes minted by the generator", async () => {
  expect(await decodePass("test-secret", VECTOR, 0)).toEqual({
    kind: "participant",
    registrationId: "366dc7b3-f0fd-445f-9bfe-ad520a134928",
    expiresAt: 2_000_000_000,
    refCode: "4928-3456",
  });
  await expect(decodePass("wrong", VECTOR, 0)).rejects.toThrow("signature");
});
