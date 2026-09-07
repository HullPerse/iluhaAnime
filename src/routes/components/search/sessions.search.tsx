import EraiLoginModal from "@/routes/components/search/default/erai.search";
import NekoBtApiModal from "@/routes/components/search/default/nekobt.search";
import RutrackerLoginModal from "@/routes/components/search/default/rutracker.search";

export default function SearchSessionModals({
  showLogin,
  showEraiLogin,
  showApiModal,
  setShowLogin,
  setShowEraiLogin,
  setShowApiModal,
  onAuthenticated,
}: {
  showLogin: boolean;
  showEraiLogin: boolean;
  showApiModal: boolean;
  setShowLogin: (value: boolean) => void;
  setShowEraiLogin: (value: boolean) => void;
  setShowApiModal: (value: boolean) => void;
  onAuthenticated: () => void;
}) {
  return (
    <>
      {showLogin && (
        <RutrackerLoginModal setRutrackerAuth={onAuthenticated} setShowLogin={setShowLogin} />
      )}
      {showEraiLogin && (
        <EraiLoginModal setEraiAuth={onAuthenticated} setShowLogin={setShowEraiLogin} />
      )}
      {showApiModal && (
        <NekoBtApiModal setNekoBtAuth={onAuthenticated} setShowApiModal={setShowApiModal} />
      )}
    </>
  );
}
