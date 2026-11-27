use aes::Aes256;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm,
};
use ctr::cipher::{KeyIvInit, StreamCipher};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

#[test]
fn fixed_crypto_vectors() {
    assert_eq!(
        hex::encode(sha1::Sha1::digest(b"abc")),
        "a9993e364706816aba3e25717850c26c9cd0d89d"
    );
    assert_eq!(
        hex::encode(Sha256::digest(b"abc")),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    let mut mac = <Hmac<Sha256> as hmac::KeyInit>::new_from_slice(&[0x0b; 20]).unwrap();
    mac.update(b"Hi There");
    assert_eq!(
        hex::encode(mac.finalize().into_bytes()),
        "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
    );
    let cipher = Aes256Gcm::new_from_slice(&[0; 32]).unwrap();
    let mut sealed =
        hex::decode("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919").unwrap();
    assert_eq!(
        cipher
            .decrypt((&[0; 12]).into(), sealed.as_slice())
            .unwrap(),
        [0; 16]
    );
    sealed[0] ^= 1;
    assert!(cipher
        .decrypt((&[0; 12]).into(), sealed.as_slice())
        .is_err());
    let key =
        hex::decode("603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4").unwrap();
    let iv = hex::decode("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff").unwrap();
    let mut plain = hex::decode("6bc1bee22e409f96e93d7e117393172a").unwrap();
    ctr::Ctr128BE::<Aes256>::new_from_slices(&key, &iv)
        .unwrap()
        .apply_keystream(&mut plain);
    assert_eq!(hex::encode(plain), "601ec313775789a5b7a7f504bbf3d228");
}
