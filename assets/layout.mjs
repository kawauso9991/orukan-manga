export function createLayoutRestorer({ navigation, cancelPassive, updateLayout, readScrollY, restoreScrollY }) {
  let modalY = 0;
  let modalOpen = false, modalResized = false;
  return {
    resize() {
      cancelPassive();
      if (modalOpen) modalResized = true;
      updateLayout();
      navigation.reflow();
    },
    openModal() {
      navigation.persist(); cancelPassive();
      modalY = readScrollY(); modalOpen = true; modalResized = false;
    },
    closeModal({skipRestore = false} = {}) {
      cancelPassive(); modalOpen = false;
      if (skipRestore) return;
      if (modalResized) { updateLayout(); navigation.reflow(); }
      else restoreScrollY(modalY);
    }
  };
}
