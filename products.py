from fastapi import APIRouter, HTTPException
# APIRouter：相当于“一个小路由组/小模块”，专门放 products 相关接口。
# HTTPException：用来主动报错（比如 404 找不到商品）。
from pydantic import BaseModel, Field
# BaseModel：用来定义“请求/响应的数据长什么样”，FastAPI 会自动帮你校验。
# Field：给字段加限制，比如价格必须 > 0。
from typing import List # List：类型标注用的，告诉别人“这是一个列表”。

# prefix="/products"：这个 router 里所有接口，统一前面加 /products
# tags=["Products"]：控制 /docs 里显示的分组名字（你要的 “Products” 就在这）
router = APIRouter(prefix="/products", tags=["Products"])


# 1) 请求体：创建/更新商品时前端会发这些字段
class ProductCreate(BaseModel):  # 定义一个数据模型：创建/更新商品时用（不包含 id）
    name: str = Field(min_length=1) # name是字符串，且不能是空字符串
    price: float = Field(gt=0) # price是浮点数，并且必须gt（greater than）大于0
    stock: int = Field(ge=0) # stock是整数，并且必须ge（greater or equal）大于等于0

# 2) 响应体：返回时多一个 id
# Product 继承 ProductCreate，意思是：它自动拥有 name/price/stock，
# 再额外加一个 id，所以 Product 就是：id + name + price + stock
# 大白话：创建时你不给 id，后端生成；返回时后端会带着 id 给你。
class Product(ProductCreate):
    id: int

# 3) 临时“数据库”（先用内存顶着，最容易跑通）
# ⚠️ 注意：这是内存版，所以服务一重启，_products 就清空了。
_products: List[Product] = [] # 一个列表，里面装所有商品（每个元素是 Product）
_next_id = 1 #下一个要分配的 id 从 1 开始（每创建一个商品就 +1）


# response_model=list[Product]：告诉 FastAPI：返回值应该是“Product 的列表”
@router.get("", response_model=list[Product])
def list_products():
    return _products


# 最终路径：POST /products
@router.post("", response_model=Product, status_code=201) # status_code=201：创建成功的标准状态码（Created）
def create_product(payload: ProductCreate): # payload: ProductCreate：前端发来的 body 会被校验成 ProductCreate
    global _next_id # 说明：我要修改全局变量 _next_id（不写这个会改不到外层的）
    p = Product(id=_next_id, **payload.model_dump()) # id=_next_id：给它分配 id
# payload.model_dump()：把 payload 变成 dict：{"name":..., "price":..., "stock":...}
# **：把 dict 展开成参数（等价于 name=..., price=..., stock=...）
    _next_id += 1 # 下一个id往后挪一位
    _products.append(p) # 把新商品丢进“临时数据库”列表
    return p # 返回新创建的商品（带 id）

@router.put("/{id}", response_model=Product)
# id: int：路径里的 id 会被当成 int， payload：更新用的数据（name/price/stock）
def update_product(id: int, payload: ProductCreate):
    for i, p in enumerate(_products):
        if p.id == id:
            updated = Product(id=id, **payload.model_dump())
            _products[i] = updated
            return updated
    raise HTTPException(status_code=404, detail="Product not found")

@router.delete("/{id}", status_code=204) # 204：删除成功但不返回内容（很标准）
def delete_product(id: int):
    for i, p in enumerate(_products):
        if p.id == id:
            _products.pop(i)
            return
    raise HTTPException(status_code=404, detail="Product not found")