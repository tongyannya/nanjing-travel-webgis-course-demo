export const PROJECT_INTRODUCTION = {
  id: 'project-introduction-2026-10-10',
  title: '项目介绍',
  date: '2026/10/10',
  lead: '金陵行前是一个南京旅行规划辅助工具。你可以在地图上找想去的地方，安排住宿与每天的行程，也可以顺路了解南京的鸭文化。',
  sections: [
    {
      title: '看地图，找想去的地方',
      text: '查看景点、地铁、酒店和餐饮分布，点击地图上的地点了解详情。遇到喜欢的景点，可以加入本次行程。',
    },
    {
      title: '从住处出发，安排每天的行程',
      text: '先安排住宿，再选择游玩日期和偏好，生成每天的景点、交通与用餐安排。沿着时间轴查看当天路线，展开交通段了解具体走法，也可以保存方案或导出行程。',
    },
    {
      title: '换个角度，逛逛南京鸭文化',
      text: '打开鸭文化主题，看看南京鸭店与风味分布，了解盐水鸭、板鸭、烤鸭和鸭血粉丝汤。翻书的鸭子向导还会讲讲鸭文化故事，带你继续阅读相关内容。',
    },
  ],
  ending:
    '第一次使用，可以先看看使用教程；也可以直接进入地图，挑一个想去的地方开始。祝你在南京玩得开心！',
}

// New letters can be added here without changing the opening introduction.
export const AUTHOR_LETTERS = [
  PROJECT_INTRODUCTION,
  {
    id: 'author-placeholder-2026-10-10',
    title: '占位文章',
    date: '2026/10/10',
    lead: '这里暂时放一篇占位文章，用来预览作者的话列表和不同颜色的文章按钮。',
    sections: [
      {
        title: '等下一封信到来',
        text: '正式的作者的话会在之后补上。现在可以切换两篇文章，看看这个小角落的样子。',
      },
    ],
    ending: '这篇占位内容会在正式文章加入时替换。',
  },
]

// The skyline's chicken temple tower corresponds to the Jiming Temple map point.
export const AUTHOR_LANDMARK_SEQUENCE = ['attr_001', 'attr_019', 'attr_017', 'attr_014', 'attr_030']
