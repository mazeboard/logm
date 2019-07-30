function dashboardEditor() {
    var d = this;
    this.value = "";
    this.getValue = () => {
      d.value;
    };

    this.setValue = (value) => {
       d.value = value;
    }
}