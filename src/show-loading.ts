export function showLoading(id: number, onCancel: (() => void) | null | undefined) {
  const vid = "loading-mask-" + id;
  const maskView: UiTypes.ViewOptions = {
    type: "view",
    props: {
      id: vid,
      bgcolor: $color("clear"),
    },
    layout: $layout.fill,
    views: [
      {
        type: "view",
        props: {
          smoothCorners: true,
          cornerRadius: 16,
        },
        layout: (make, view) => {
          make.center.equalTo(view.super);
          make.size.equalTo($size(250, 151));
        },
        views: [
          {
            type: "view",
            props: {
              bgcolor: $color("#7d7d7d", "#262626"),
            },
            layout: $layout.fill,
          },
          {
            type: "label",
            props: {
              text: "请稍等",
              textColor: $color("white"),
              font: $font("bold", 17),
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.top.inset(15);
            },
          },
          {
            type: "spinner",
            props: {
              loading: true,

              style: 101,
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.centerY.equalTo(view.super).offset(0);
            },
          },
          {
            type: "view",
            props: {
              bgcolor: $color("separator"),
            },
            layout: (make, view) => {
              make.top.equalTo(view.prev.bottom).inset(15);
              make.left.right.inset(0);
              make.height.equalTo(1 / $device.info.screen.scale);
            },
          },
          {
            type: "button",
            props: {
              title: onCancel ? "取消" : "隐藏",
              font: $font(16),
              bgcolor: $color("clear"),
            },
            layout: (make, view) => {
              make.top.equalTo(view.prev.bottom).inset(5);
              make.centerX.equalTo(view.super);
            },
            events: {
              tapped: () => {
                $(vid).remove();
                if (onCancel) {
                  onCancel();
                }
              },
            },
          },
        ],
      },
    ],
  };
  $ui.window.add(maskView);
}
